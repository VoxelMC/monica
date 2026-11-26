// Duplicate people (2026-11-26): find people with the same name, plan a merge of one
// copy into the person to keep, and list what would stop it. Pure functions on
// Monica's JSON, shared by the Duplicates page and guards.removeMergedDuplicate,
// which runs mergeLeftovers again on fresh data right before deleting the copy.

type Json = Record<string, unknown>;

/** "Kayla  Preocanin" and "kayla preocanin" are the same name. */
export function nameKey(first: string | null | undefined, middle: string | null | undefined, last: string | null | undefined): string {
	return [first, middle, last]
		.map((p) => (p ?? '').normalize('NFC').trim().toLocaleLowerCase())
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/g, ' ');
}

/** Same number in other formats: compare the last 9 digits (as the Monica patch does). */
export function phoneKey(v: string): string {
	return v.replace(/\D+/g, '').slice(-9);
}
export function fieldKey(type: string | null | undefined, content: string): string {
	const t = type ?? 'other';
	if (t === 'phone') return `phone:${phoneKey(content)}`;
	return `${t}:${content.trim().toLocaleLowerCase()}`;
}

/** Groups of 2+ ids whose names match. */
export function duplicateGroups<T extends { id: number; nameKey: string }>(people: T[]): T[][] {
	const by = new Map<string, T[]>();
	for (const p of people) {
		if (!p.nameKey) continue;
		const list = by.get(p.nameKey) ?? [];
		list.push(p);
		by.set(p.nameKey, list);
	}
	return [...by.values()].filter((g) => g.length > 1).map((g) => g.sort((a, b) => a.id - b.id));
}

// ---- Reading Monica's contact JSON (GET /api/contacts/{id}?with=contactfields)

interface Field {
	typeId: number;
	type: string | null;
	content: string;
}
export function fieldsOf(c: Json): Field[] {
	const list = (c.contactFields as Json[] | undefined) ?? [];
	return list.map((f) => {
		const t = (f.contact_field_type ?? {}) as Json;
		return { typeId: Number(t.id), type: (t.type as string | null) ?? null, content: String(f.content ?? '') };
	});
}
export function tagsOf(c: Json): string[] {
	return ((c.tags as Json[] | undefined) ?? []).map((t) => String(t.name));
}
function info(c: Json): Json {
	return (c.information ?? {}) as Json;
}
export function birthdayOf(c: Json): string | null {
	const d = ((info(c).dates as Json | undefined)?.birthdate as Json | undefined)?.date;
	return typeof d === 'string' && d ? d.slice(0, 10) : null;
}
export function birthdayIsExact(c: Json): boolean {
	const b = (info(c).dates as Json | undefined)?.birthdate as Json | undefined;
	return !!b && typeof b.date === 'string' && b.is_age_based !== true;
}
export function hasPhoto(c: Json): boolean {
	return ((info(c).avatar as Json | undefined)?.source ?? null) === 'photo';
}
function stats(c: Json): Record<string, number> {
	return (c.statistics as Record<string, number> | undefined) ?? {};
}
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** How much a person holds; the one with most is suggested as the one to keep. */
export function richness(c: Json): number {
	const s = stats(c);
	const counted = Object.values(s).reduce((a, b) => a + (Number(b) || 0), 0);
	return tagsOf(c).length * 2 + fieldsOf(c).length + counted * 3 + (birthdayOf(c) ? 2 : 0) + (((c.addresses as unknown[]) ?? []).length ? 2 : 0);
}

export interface MergePlan {
	/** Tag names to add to the person kept. */
	tags: string[];
	/** Phones and emails to add to the person kept. */
	fields: { typeId: number; type: string; content: string }[];
	/** Add the copy's birthday (the person kept has none). */
	birthday: boolean;
	/** The copy has a photo (the owner picks which one stays). */
	copyHasPhoto: boolean;
	/** Reasons orbit will not merge these two; empty = it can. */
	blockers: string[];
}

/** What merging `copy` into `keep` does, from their contact JSON (no list data). */
export function planMerge(keep: Json, copy: Json): MergePlan {
	const blockers: string[] = [];
	if (keep.id === copy.id) blockers.push('it is the same person');
	if (copy.is_me === true) blockers.push('the copy is you (your own Monica contact)');
	if (keep.is_partial === true || keep.is_active === false) blockers.push('the person to keep is archived or partial');

	const have = new Set(tagsOf(keep).map((t) => t.toLocaleLowerCase()));
	const tags = tagsOf(copy).filter((t) => !have.has(t.toLocaleLowerCase()));

	const haveF = new Set(fieldsOf(keep).map((f) => fieldKey(f.type, f.content)));
	const fields: MergePlan['fields'] = [];
	for (const f of fieldsOf(copy)) {
		const k = fieldKey(f.type, f.content);
		if (haveF.has(k)) continue;
		if (f.type === 'phone' || f.type === 'email') {
			fields.push({ typeId: f.typeId, type: f.type, content: f.content.trim() });
			haveF.add(k);
		} else blockers.push(`the copy has a ${f.type ?? 'custom'} field orbit cannot move (${f.content})`);
	}

	let birthday = false;
	const cb = birthdayOf(copy);
	const kb = birthdayOf(keep);
	if (cb && kb && cb !== kb) blockers.push(`different birthdays (${kb} and ${cb}); fix one first`);
	else if (cb && !kb) {
		if (birthdayIsExact(copy)) birthday = true;
		else blockers.push('the copy has an age-based birthday orbit cannot move');
	}

	const s = stats(copy);
	const names: Record<string, [string, string]> = {
		number_of_notes: ['note', 'notes'],
		number_of_activities: ['hangout', 'hangouts'],
		number_of_calls: ['call', 'calls'],
		number_of_tasks: ['task', 'tasks'],
		number_of_gifts: ['gift', 'gifts'],
		number_of_debts: ['debt', 'debts']
	};
	for (const [k, [one, many]] of Object.entries(names)) if ((s[k] ?? 0) > 0) blockers.push(`the copy has ${s[k]} ${s[k] === 1 ? one : many}`);
	// A birthday makes one reminder; that one is fine (it goes when the copy does)
	if ((s.number_of_reminders ?? 0) > (cb ? 1 : 0)) blockers.push('the copy has reminders');
	if (((copy.addresses as unknown[]) ?? []).length) blockers.push('the copy has addresses');
	const rel = (info(copy).relationships ?? {}) as Record<string, { total?: number } | undefined>;
	if (Object.values(rel).some((g) => (g?.total ?? 0) > 0)) blockers.push('the copy has relationships');
	if (text(copy.description)) blockers.push('the copy has a description');
	const career = (info(copy).career ?? {}) as Json;
	if (text(career.job) || text(career.company)) blockers.push('the copy has a job or company');
	if (text(info(copy).food_preferences)) blockers.push('the copy has food preferences');
	if (text(((info(copy).how_you_met ?? {}) as Json).general_information)) blockers.push('the copy has "how you met"');
	if (text(copy.nickname) && text(copy.nickname) !== text(keep.nickname)) blockers.push(`the copy has a nickname (${text(copy.nickname)})`);

	return { tags, fields, birthday, copyHasPhoto: hasPhoto(copy), blockers };
}

/** Lists only a fresh read can show (GET /api/contacts/{id}/...). */
export interface CopyLists {
	pets: unknown[];
	conversations: unknown[];
	documents: unknown[];
	photos: Json[];
	reminders: Json[];
}

/**
 * Right before deleting: what is still on the copy that is not on the person kept.
 * Empty = nothing would be lost (besides the copy's photo, which the owner chose).
 */
export function mergeLeftovers(keep: Json, copy: Json, lists: CopyLists): string[] {
	const plan = planMerge(keep, copy);
	const left = [...plan.blockers];
	if (plan.tags.length) left.push(`tags not on the person kept yet: ${plan.tags.join(', ')}`);
	if (plan.fields.length) left.push(`phones or emails not on the person kept yet: ${plan.fields.map((f) => f.content).join(', ')}`);
	if (plan.birthday) left.push('the birthday is not on the person kept yet');
	if (lists.pets.length) left.push('the copy has pets');
	if (lists.conversations.length) left.push('the copy has conversations');
	if (lists.documents.length) left.push('the copy has documents');
	if (lists.photos.length > (plan.copyHasPhoto ? 1 : 0)) left.push('the copy has photos besides its profile photo');
	if (lists.reminders.some((r) => r.delible !== false)) left.push('the copy has reminders');
	return [...new Set(left)];
}
