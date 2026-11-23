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

const change = z.object({
	contactId: z.coerce.number().int().positive(),
	updatedAt: z.string().min(1).max(40),
	month: z.coerce.number().int(),
	day: z.coerce.number().int(),
	year: z.union([z.literal(''), z.coerce.number().int()]).nullable().default(null)
});

/**
 * Correct an existing birthday (contact page, 2026-11-23). Monica replaces the
 * birthday and deletes its yearly reminder; `hadReminder` (the contact has a
 * birthday reminder now) decides whether Monica makes a new one.
 */
export async function changeBirthday(guards: Guards, form: FormData, hadReminder: boolean, today = new Date()): Promise<{ ok: boolean; message: string; dryRun: boolean }> {
	const parsed = change.safeParse({
		contactId: form.get('contactId'),
		updatedAt: form.get('updatedAt'),
		month: form.get('month'),
		day: form.get('day'),
		year: form.get('year')
	});
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const { contactId, updatedAt, month, day } = parsed.data;
	const b = { month, day, year: parsed.data.year === '' || parsed.data.year === null ? null : parsed.data.year };
	const why = checkBirthday(b, today);
	if (why) return { ok: false, dryRun: false, message: why };
	try {
		const res = await guards.update('contact.birthday.change', contactId, { ...birthdayChanges(b), birthdate_add_reminder: hadReminder }, updatedAt);
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: the change is in the audit log; nothing was sent.' : 'Birthday corrected.' };
	} catch (err) {
		let msg = 'Something went wrong; the birthday was not changed.';
		if (err instanceof ConflictError) msg = 'This contact changed in Monica since the page loaded. Reload and try again.';
		else if (err instanceof WriteRefusedError && err.reason === 'read-only') msg = 'orbit is read-only (ORBIT_READ_ONLY=true). Nothing was changed.';
		else if (err instanceof WriteRefusedError && err.reason === 'precondition') msg = 'This contact has no birthday in Monica any more. Reload and add one instead.';
		else if (err instanceof WriteRefusedError) msg = `orbit refused it (${err.reason}). Nothing was changed.`;
		else if (err instanceof MonicaError) msg = `${err.message}. The birthday may not have changed; check the audit log.`;
		return { ok: false, dryRun: false, message: msg };
	}
}
