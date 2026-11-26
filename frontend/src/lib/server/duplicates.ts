// Duplicate people (2026-11-26): load the groups for the Duplicates page, and merge
// one copy into the person kept. Every Monica write goes through the guards; the
// copy is deleted last, by guards.removeMergedDuplicate, which re-reads everything
// and refuses if anything would be lost.
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { z } from 'zod';
import { parseBirthday } from '../contact';
import { birthdayChanges } from '../birthday-write';
import { displayName, photoKey } from '../contacts';
import { duplicateGroups, fieldsOf, hasPhoto, nameKey, planMerge, richness, tagsOf, type MergePlan } from '../duplicates';
import { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from '../photo';
import type { OrbitDb } from './db';
import { avatarThumbs, contactMeta, groupMembers, journalMentions, reminders, souvenirList } from './db/schema';
import type { MonicaClient } from './monica/client';
import { getPhotoByKey } from './monica/contacts';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';
import { contactDetail, contactListItem, single } from './monica/schemas';

type Json = Record<string, unknown>;

export interface DuplicatePerson {
	id: number;
	name: string;
	initials: string;
	color: string;
	hasPhoto: boolean;
	photoKey: string | null;
	tags: string[];
	fields: string[];
	birthday: string | null;
	createdAt: string;
	updatedAt: string;
	/** "2 notes, 1 hangout" */
	holds: string;
}
export interface DuplicateGroup {
	key: string;
	people: DuplicatePerson[];
	suggestedKeep: number;
	/** plans[`${keep}:${copy}`] */
	plans: Record<string, MergePlan>;
}

const STAT_LABELS: [string, string, string][] = [
	['number_of_notes', 'note', 'notes'],
	['number_of_activities', 'hangout', 'hangouts'],
	['number_of_calls', 'call', 'calls'],
	['number_of_tasks', 'task', 'tasks'],
	['number_of_gifts', 'gift', 'gifts'],
	['number_of_debts', 'debt', 'debts']
];

function holds(c: Json): string {
	const s = (c.statistics as Record<string, number> | undefined) ?? {};
	const parts = STAT_LABELS.filter(([k]) => (s[k] ?? 0) > 0).map(([k, one, many]) => `${s[k]} ${s[k] === 1 ? one : many}`);
	return parts.join(', ');
}

function view(c: Json): DuplicatePerson {
	const avatar = ((c.information as Json).avatar ?? {}) as { source?: string | null; url?: string | null; default_avatar_color?: string | null };
	const b = parseBirthday(((c.information as Json).dates as Json | undefined)?.birthdate as never);
	return {
		id: c.id as number,
		name: displayName(c.first_name as string | null, c.last_name as string | null, String(c.complete_name ?? '')),
		initials: String(c.initials ?? ''),
		color: avatar.default_avatar_color ?? '#64748b',
		hasPhoto: hasPhoto(c),
		photoKey: photoKey(avatar),
		tags: tagsOf(c),
		fields: fieldsOf(c)
			.filter((f) => f.type === 'phone' || f.type === 'email')
			.map((f) => f.content),
		birthday: b ? `${b.year ?? '????'}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : null,
		createdAt: String(c.created_at ?? ''),
		updatedAt: String(c.updated_at ?? ''),
		holds: holds(c)
	};
}

/** Every group of people with the same name, with a merge plan for each pair. */
export async function loadDuplicates(monica: MonicaClient): Promise<DuplicateGroup[]> {
	const all = await monica.getAll('/api/contacts', contactListItem, { with: 'contactfields' });
	const people = all
		.filter((c) => !c.is_partial && c.is_active)
		.map((c) => ({ id: c.id, nameKey: nameKey(c.first_name, (c as Json).middle_name as string | null, c.last_name) }));
	const groups: DuplicateGroup[] = [];
	for (const g of duplicateGroups(people)) {
		const details = (await Promise.all(g.map((p) => monica.get(`/api/contacts/${p.id}`, single(contactDetail), { with: 'contactfields' })))).map((r) => r.data as Json);
		const plans: Record<string, MergePlan> = {};
		for (const keep of details) for (const copy of details) if (keep !== copy) plans[`${keep.id}:${copy.id}`] = planMerge(keep, copy);
		// Keep the one holding most; on a tie, the oldest
		const suggested = [...details].sort((a, b) => richness(b) - richness(a) || (a.id as number) - (b.id as number))[0];
		groups.push({ key: g[0].nameKey, people: details.map(view), suggestedKeep: suggested.id as number, plans });
	}
	return groups.sort((a, b) => a.key.localeCompare(b.key));
}

const form = z.object({
	keep: z.coerce.number().int().positive(),
	copy: z.coerce.number().int().positive(),
	keepUpdatedAt: z.string().min(1).max(40),
	copyUpdatedAt: z.string().min(1).max(40),
	photo: z.enum(['keep', 'copy']).default('keep')
});

export interface MergeResult {
	ok: boolean;
	message: string;
	dryRun: boolean;
}

/** Move orbit's own data about the copy (targets, groups, trips, reminders, mentions) to the person kept. */
export function moveOrbitData(db: OrbitDb, copyId: number, keepId: number): void {
	db.transaction((tx) => {
		tx.update(reminders).set({ monicaContactId: keepId }).where(eq(reminders.monicaContactId, copyId)).run();
		tx.update(journalMentions).set({ monicaContactId: keepId }).where(eq(journalMentions.monicaContactId, copyId)).run();
		// Catch-up target: the kept person's own wins
		const keepMeta = tx.select().from(contactMeta).where(eq(contactMeta.monicaContactId, keepId)).get();
		if (keepMeta) tx.delete(contactMeta).where(eq(contactMeta.monicaContactId, copyId)).run();
		else tx.update(contactMeta).set({ monicaContactId: keepId }).where(eq(contactMeta.monicaContactId, copyId)).run();
		// Groups: membership moves (once per group)
		for (const m of tx.select().from(groupMembers).where(eq(groupMembers.monicaContactId, copyId)).all()) {
			tx.insert(groupMembers).values({ ...m, monicaContactId: keepId }).onConflictDoNothing().run();
		}
		tx.delete(groupMembers).where(eq(groupMembers.monicaContactId, copyId)).run();
		// Trips: the copy's note is added to the kept person's
		for (const s of tx.select().from(souvenirList).where(eq(souvenirList.monicaContactId, copyId)).all()) {
			const mine = tx.select().from(souvenirList).where(and(eq(souvenirList.tripId, s.tripId), eq(souvenirList.monicaContactId, keepId))).get();
			if (!mine) tx.insert(souvenirList).values({ ...s, monicaContactId: keepId }).run();
			else if (s.note.trim() && s.note.trim() !== mine.note.trim()) {
				tx.update(souvenirList)
					.set({ note: [mine.note.trim(), s.note.trim()].filter(Boolean).join('; '), done: mine.done && s.done })
					.where(and(eq(souvenirList.tripId, s.tripId), eq(souvenirList.monicaContactId, keepId)))
					.run();
			}
		}
		tx.delete(souvenirList).where(eq(souvenirList.monicaContactId, copyId)).run();
		tx.delete(avatarThumbs).where(eq(avatarThumbs.monicaContactId, copyId)).run();
	});
}

/** The copy's photo as a JPEG data URL small enough for Monica (and orbit's photo rule). */
async function photoForUpload(bytes: Uint8Array): Promise<string> {
	for (const quality of [85, 75, 60, 45]) {
		const out = await sharp(bytes, { failOn: 'none' })
			.rotate()
			.resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality })
			.toBuffer();
		const url = `data:image/jpeg;base64,${out.toString('base64')}`;
		if (url.length <= PHOTO_MAX_BYTES) return url;
	}
	throw new Error('the photo is too large even after shrinking');
}

async function fresh(monica: MonicaClient, id: number): Promise<Json> {
	return (await monica.get(`/api/contacts/${id}`, single(contactDetail), { with: 'contactfields' })).data as Json;
}

/** Merge one copy into the person kept: move tags, phones/emails, birthday, photo, orbit data; then delete the copy. */
export async function mergeDuplicate(guards: Guards, db: OrbitDb, monica: MonicaClient, data: FormData): Promise<MergeResult> {
	const parsed = form.safeParse(Object.fromEntries(['keep', 'copy', 'keepUpdatedAt', 'copyUpdatedAt', 'photo'].map((k) => [k, data.get(k) ?? undefined])));
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The merge form could not be read. Reload and try again.' };
	const f = parsed.data;
	if (f.keep === f.copy) return { ok: false, dryRun: false, message: 'Pick two different people.' };
	const done: string[] = [];
	const failMsg = (err: unknown) => {
		const why =
			err instanceof ConflictError
				? 'one of them was changed somewhere else; reload the page'
				: err instanceof WriteRefusedError && err.reason === 'read-only'
					? 'orbit is read-only (ORBIT_READ_ONLY=true)'
					: err instanceof WriteRefusedError || err instanceof MonicaError
						? err.message
						: err instanceof Error
							? err.message
							: 'something went wrong';
		const progress = done.length ? ` Already done: ${done.join(', ')}. Nothing was deleted; run the merge again to finish.` : ' Nothing was changed.';
		return { ok: false, dryRun: false, message: `Not merged: ${why}.${progress}` };
	};

	try {
		monica.invalidate(); // read both fresh
		let keep = await fresh(monica, f.keep);
		const copy = await fresh(monica, f.copy);
		if (keep.updated_at !== f.keepUpdatedAt || copy.updated_at !== f.copyUpdatedAt) {
			return { ok: false, dryRun: false, message: 'Not merged: one of them was changed somewhere else since you opened the page. Reload and check again.' };
		}
		const plan = planMerge(keep, copy);
		if (plan.blockers.length) return { ok: false, dryRun: false, message: `Not merged: ${plan.blockers.join('; ')}.` };

		let dryRun = false;
		for (const t of plan.tags) {
			dryRun = (await guards.create('contact.tags.add', { tags: [t] }, f.keep)).dryRun || dryRun;
			done.push(`tag ${t}`);
		}
		for (const fl of plan.fields) {
			dryRun = (await guards.create('contactfield.create', { contact_id: f.keep, contact_field_type_id: fl.typeId, data: fl.content })).dryRun || dryRun;
			done.push(fl.content);
		}
		if (plan.birthday) {
			const b = parseBirthday(((copy.information as Json).dates as Json).birthdate as never)!;
			keep = await fresh(monica, f.keep);
			dryRun = (await guards.update('contact.birthday', f.keep, birthdayChanges({ month: b.month, day: b.day, year: b.year }), String(keep.updated_at))).dryRun || dryRun;
			done.push('birthday');
		}
		if (f.photo === 'copy' && plan.copyHasPhoto) {
			const key = photoKey(((copy.information as Json).avatar ?? {}) as never);
			const img = key ? await getPhotoByKey(monica, f.copy, key) : null;
			if (!img) throw new Error("the copy's photo could not be read from Monica");
			const up = await guards.create('photo.upload', { contact_id: f.keep, data: await photoForUpload(img.bytes) });
			if (up.dryRun) dryRun = true;
			else {
				const photoId = (up.response as { data?: { id?: unknown } } | null)?.data?.id;
				if (typeof photoId !== 'number') throw new Error('Monica did not say the new photo id');
				keep = await fresh(monica, f.keep);
				await guards.update('contact.avatar', f.keep, { source: 'photo', photo_id: photoId }, String(keep.updated_at));
			}
			done.push('photo');
		}
		if (dryRun) {
			return { ok: true, dryRun: true, message: 'Dry run: the merge steps are in the audit log; nothing was sent and nothing was deleted.' };
		}
		moveOrbitData(db, f.copy, f.keep);
		done.push("orbit's own data");
		const keepName = displayName(keep.first_name as string | null, keep.last_name as string | null, String(keep.complete_name ?? ''));
		await guards.removeMergedDuplicate(f.copy, f.keep, String(copy.updated_at), `merged into ${keepName} (#${f.keep}) from orbit's Duplicates page`);
		const moved = done.filter((d) => d !== "orbit's own data");
		return {
			ok: true,
			dryRun: false,
			message: `Merged into ${keepName}${moved.length ? ` (added ${moved.join(', ')})` : ''}. The copy is deleted; your phone drops it on its next sync.`
		};
	} catch (err) {
		return failMsg(err);
	}
}
