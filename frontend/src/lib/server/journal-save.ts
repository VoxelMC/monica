// Journal entries with @mentions (2026-11-23). Monica gets the readable text
// (POST /api/journal through the guards); orbit records which contact each
// mention meant in its own database, after Monica returns the entry id.
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { activeMentions, checkJournal, journalPayload } from '../log';
import type { OrbitDb } from './db';
import { journalMentions } from './db/schema';
import { MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

const draft = z.object({
	title: z.string().max(1000),
	post: z.string().max(1_000_000),
	mentions: z.array(z.object({ contactId: z.number().int().positive(), name: z.string().min(1).max(500) })).max(200).default([])
});

export interface JournalSaveResult {
	ok: boolean;
	message: string;
	entryId: number | null;
	dryRun: boolean;
}

export async function saveJournal(guards: Guards, db: OrbitDb, raw: unknown, knownContactIds: Set<number>): Promise<JournalSaveResult> {
	const fail = (message: string): JournalSaveResult => ({ ok: false, message, entryId: null, dryRun: false });
	const parsed = draft.safeParse(raw);
	if (!parsed.success) return fail('The form could not be read. Reload the page and try again.');
	const { title, post } = parsed.data;
	const problem = Object.values(checkJournal({ title, post }))[0];
	if (problem) return fail(problem);
	// Only mentions still present in the text, of people who exist
	const mentions = activeMentions(post, parsed.data.mentions);
	if (mentions.some((m) => !knownContactIds.has(m.contactId))) return fail('Someone you mentioned is not in Monica any more. Reload and try again.');

	let entryId: number | null = null;
	let dryRun = false;
	try {
		const res = await guards.create('journal.create', journalPayload({ title, post }));
		dryRun = res.dryRun;
		const id = (res.response as { data?: { id?: unknown } } | null)?.data?.id;
		entryId = typeof id === 'number' ? id : null;
	} catch (err) {
		let why = 'Something went wrong.';
		if (err instanceof WriteRefusedError && err.reason === 'read-only') why = 'orbit is read-only (ORBIT_READ_ONLY=true).';
		else if (err instanceof WriteRefusedError) why = `orbit refused it (${err.reason}).`;
		else if (err instanceof MonicaError) why = `${err.message}.`;
		return fail(`${why} The entry was not saved.`);
	}
	if (dryRun) return { ok: true, dryRun, entryId: null, message: 'Dry run: the entry is in the audit log; nothing was sent.' };
	if (entryId === null) return { ok: false, dryRun, entryId, message: 'The entry was saved in Monica, but orbit could not read its id, so the mentions were not linked.' };

	if (mentions.length) {
		try {
			const at = new Date().toISOString();
			db.insert(journalMentions)
				.values(mentions.map((m) => ({ journalEntryId: entryId!, monicaContactId: m.contactId, name: m.name, createdAt: at })))
				.run();
		} catch {
			return { ok: false, dryRun, entryId, message: 'The entry was saved in Monica, but orbit could not record the mentions.' };
		}
	}
	const n = mentions.length;
	return { ok: true, dryRun, entryId, message: `Saved the journal entry${n ? `, linked to ${n} ${n === 1 ? 'person' : 'people'}` : ''}.` };
}

/** Mentions recorded by orbit, by journal entry id. */
export function mentionsByEntry(db: OrbitDb, entryIds: number[]): Map<number, { contactId: number; name: string }[]> {
	const out = new Map<number, { contactId: number; name: string }[]>();
	if (!entryIds.length) return out;
	for (const r of db.select().from(journalMentions).where(inArray(journalMentions.journalEntryId, entryIds)).all()) {
		const list = out.get(r.journalEntryId) ?? [];
		if (!list.some((x) => x.contactId === r.monicaContactId)) list.push({ contactId: r.monicaContactId, name: r.name });
		out.set(r.journalEntryId, list);
	}
	return out;
}

/** Journal entry ids that mention a contact. */
export function entriesMentioning(db: OrbitDb, contactId: number): number[] {
	return [...new Set(db.select().from(journalMentions).where(eq(journalMentions.monicaContactId, contactId)).all().map((r) => r.journalEntryId))];
}

/** After a journal entry is removed from Monica, drop orbit's links to it. */
export function forgetEntry(db: OrbitDb, entryId: number): void {
	db.delete(journalMentions).where(eq(journalMentions.journalEntryId, entryId)).run();
}
