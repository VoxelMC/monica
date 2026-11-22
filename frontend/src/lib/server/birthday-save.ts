// Saving birthdays (2026-11-23): one guarded fetch-merge-send PUT per person, in
// order; stops at the first failure and reports who was saved. Never overwrites
// an existing birthday (the guard rule refuses it after reading the contact).
import { z } from 'zod';
import { birthdayChanges, checkBirthday } from '../birthday-write';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

const draft = z.object({
	entries: z
		.array(z.object({ id: z.number().int().positive(), month: z.number().int(), day: z.number().int(), year: z.number().int().nullable(), updatedAt: z.string().min(1) }))
		.min(1)
		.max(200)
});

export interface BirthdaySaveResult {
	ok: boolean;
	message: string;
	saved: number[];
	dryRun: boolean;
}

export async function saveBirthdays(guards: Guards, raw: unknown, names: Map<number, string>, today = new Date()): Promise<BirthdaySaveResult> {
	const parsed = draft.safeParse(raw);
	if (!parsed.success) return { ok: false, saved: [], dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const entries = parsed.data.entries;
	if (new Set(entries.map((e) => e.id)).size !== entries.length) return { ok: false, saved: [], dryRun: false, message: 'A person appears twice. Reload and try again.' };
	for (const e of entries) {
		if (!names.has(e.id)) return { ok: false, saved: [], dryRun: false, message: 'One of the people is not in Monica any more. Reload and try again.' };
		const why = checkBirthday(e, today);
		if (why) return { ok: false, saved: [], dryRun: false, message: `${names.get(e.id)}: ${why}` };
	}

	const saved: number[] = [];
	let dryRun = false;
	for (const e of entries) {
		const name = names.get(e.id)!;
		try {
			const res = await guards.update('contact.birthday', e.id, birthdayChanges(e), e.updatedAt);
			dryRun = res.dryRun;
			saved.push(e.id);
		} catch (err) {
			const done = saved.length ? `Saved ${saved.length} before this; ` : 'Nothing was saved; ';
			let why = 'something went wrong';
			if (err instanceof ConflictError) why = 'their contact changed in Monica since this page loaded (reload and check)';
			else if (err instanceof WriteRefusedError && err.reason === 'read-only') why = 'orbit is read-only (ORBIT_READ_ONLY=true)';
			else if (err instanceof WriteRefusedError && err.reason === 'precondition') why = 'they already have a birthday in Monica, so it was left as it is';
			else if (err instanceof WriteRefusedError) why = `orbit refused it (${err.reason})`;
			else if (err instanceof MonicaError) why = err.message;
			return { ok: false, saved, dryRun, message: `${name}: ${why}. ${done}the rest were not attempted.` };
		}
	}
	return {
		ok: true,
		saved,
		dryRun,
		message: dryRun ? `Dry run: ${saved.length} birthday${saved.length === 1 ? '' : 's'} logged in the audit log, nothing sent.` : `Saved ${saved.length} birthday${saved.length === 1 ? '' : 's'}. Monica added a yearly reminder for each.`
	};
}
