// Saving a hangout (slice 4): one activity, then an optional note per person.
// Everything is re-validated here; the browser's draft is never trusted.
// Writes go only through guards.ts (read-only switch, allowlist, audit log).
import { z } from 'zod';
import { checkHangout, checkPersonNotes, hangoutPayload, personNotePayloads, type HangoutDraft } from '../log';
import { MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

const draftSchema = z.object({
	contactIds: z.array(z.number().int().positive()).max(200),
	summary: z.string().max(1000),
	description: z.string().max(100_000),
	date: z.string().max(10),
	activityTypeId: z.number().int().positive().nullable(),
	personNotes: z.record(z.string().regex(/^\d+$/), z.string().max(100_000)).default({})
});

export interface SaveResult {
	ok: boolean;
	message: string;
	dryRun: boolean;
	activityId: number | null;
	/** Notes in the order they were attempted. */
	notes: { contactId: number; saved: boolean }[];
}

export async function saveHangout(
	guards: Guards,
	raw: unknown,
	known: { contactIds: Set<number>; activityTypeIds: Set<number> },
	today?: string
): Promise<SaveResult> {
	const empty = { dryRun: false, activityId: null, notes: [] };
	const parsed = draftSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, message: 'The form could not be read. Reload the page and try again.', ...empty };
	const d = parsed.data;
	const draft: HangoutDraft = {
		contactIds: [...new Set(d.contactIds)],
		summary: d.summary,
		description: d.description,
		date: d.date,
		activityTypeId: d.activityTypeId,
		personNotes: Object.fromEntries(Object.entries(d.personNotes).map(([k, v]) => [Number(k), v]))
	};
	const problems = { ...checkHangout(draft, today), ...checkPersonNotes(draft) };
	const first = Object.values(problems)[0];
	if (first) return { ok: false, message: first, ...empty };
	if (draft.contactIds.some((id) => !known.contactIds.has(id))) return { ok: false, message: 'One of the people is not in Monica any more. Reload and try again.', ...empty };
	if (draft.activityTypeId !== null && !known.activityTypeIds.has(draft.activityTypeId)) return { ok: false, message: 'That activity type is not in Monica. Pick another.', ...empty };

	// 1. The activity (one write for everyone who was there)
	let activityId: number | null = null;
	let dryRun = false;
	try {
		const res = await guards.create('activity.create', hangoutPayload(draft));
		dryRun = res.dryRun;
		const data = (res.response as { data?: { id?: unknown } } | null)?.data;
		activityId = typeof data?.id === 'number' ? data.id : null;
	} catch (err) {
		return { ok: false, message: describe(err, 'Nothing was saved.'), ...empty };
	}

	// 2. Notes, one per person; stop at the first failure and say what was saved.
	const notes: SaveResult['notes'] = [];
	for (const n of personNotePayloads(draft)) {
		try {
			await guards.create('note.create', n);
			notes.push({ contactId: n.contact_id, saved: true });
		} catch (err) {
			notes.push({ contactId: n.contact_id, saved: false });
			const done = notes.filter((x) => x.saved).length;
			return { ok: false, dryRun, activityId, notes, message: describe(err, `The hangout and ${done} note${done === 1 ? '' : 's'} were saved; this note and any after it were not.`) };
		}
	}
	const saved = notes.length;
	return {
		ok: true,
		dryRun,
		activityId,
		notes,
		message: dryRun
			? `Dry run: nothing was sent. The hangout${saved ? ` and ${saved} note${saved === 1 ? '' : 's'}` : ''} are in the audit log.`
			: `Saved the hangout${saved ? ` and ${saved} note${saved === 1 ? '' : 's'}` : ''}.`
	};
}

function describe(err: unknown, consequence: string): string {
	if (err instanceof WriteRefusedError && err.reason === 'read-only') return `orbit is read-only (ORBIT_READ_ONLY=true). ${consequence}`;
	if (err instanceof WriteRefusedError) return `orbit refused this write (${err.reason}). ${consequence}`;
	if (err instanceof MonicaError) return `${err.message}. ${consequence}`;
	return `Something went wrong. ${consequence}`;
}
