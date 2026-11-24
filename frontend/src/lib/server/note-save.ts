// Add a note to one person (contact page, 2026-11-24): POST /api/notes through the
// guards, the same approved write the hangout form uses for per-person notes.
import { z } from 'zod';
import { MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

export const NOTE_MAX = 100_000;
const input = z.object({ contactId: z.coerce.number().int().positive(), body: z.string().max(NOTE_MAX) });

export async function addNote(guards: Guards, form: FormData): Promise<{ ok: boolean; message: string; dryRun: boolean }> {
	const parsed = input.safeParse({ contactId: form.get('contactId'), body: form.get('body') ?? '' });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The note could not be read (too long?).' };
	const body = parsed.data.body.trim();
	if (!body) return { ok: false, dryRun: false, message: 'Write something first.' };
	try {
		const res = await guards.create('note.create', { contact_id: parsed.data.contactId, body });
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: the note is in the audit log; nothing was sent.' : 'Note added.' };
	} catch (err) {
		let why = 'Something went wrong.';
		if (err instanceof WriteRefusedError && err.reason === 'read-only') why = 'orbit is read-only (ORBIT_READ_ONLY=true).';
		else if (err instanceof WriteRefusedError) why = `orbit refused it (${err.reason}).`;
		else if (err instanceof MonicaError) why = `${err.message}.`;
		return { ok: false, dryRun: false, message: `${why} The note was not saved.` };
	}
}
