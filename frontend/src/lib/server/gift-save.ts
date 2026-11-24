// Gift ideas (2026-11-24), stored in Monica: add an idea for a person, and mark a
// gift given (or back to an idea). Through the guards: gift.create, gift.status.
import { z } from 'zod';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

type Result = { ok: boolean; message: string; dryRun: boolean };
function why(err: unknown): string {
	if (err instanceof ConflictError) return 'it changed in Monica since this page loaded. Reload and try again';
	if (err instanceof WriteRefusedError && err.reason === 'read-only') return 'orbit is read-only (ORBIT_READ_ONLY=true)';
	if (err instanceof WriteRefusedError && err.reason === 'precondition') return 'it has a price, so change it in Monica';
	if (err instanceof WriteRefusedError) return `orbit refused it (${err.reason})`;
	if (err instanceof MonicaError) return err.message;
	return 'something went wrong';
}

export async function addGiftIdea(guards: Guards, contactId: number, form: FormData): Promise<Result> {
	const parsed = z.object({ name: z.string().max(1000), comment: z.string().max(20_000), url: z.string().max(4000) }).safeParse({ name: form.get('name') ?? '', comment: form.get('comment') ?? '', url: form.get('url') ?? '' });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read (too long?).' };
	const name = parsed.data.name.trim();
	const comment = parsed.data.comment.trim() || null;
	let url = parsed.data.url.trim() || null;
	if (!name) return { ok: false, dryRun: false, message: 'Name the gift idea.' };
	if (name.length > 255) return { ok: false, dryRun: false, message: 'The name is too long (255 characters at most).' };
	if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
	if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return { ok: false, dryRun: false, message: 'That link does not look right.' };
	try {
		const res = await guards.create('gift.create', { contact_id: contactId, name, status: 'idea', comment, url });
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: it is in the audit log; nothing was sent.' : `Saved the idea “${name}”.` };
	} catch (err) {
		return { ok: false, dryRun: false, message: `Not saved: ${why(err)}.` };
	}
}

/** `gifts`: this contact's gifts as shown on the page, so only its own gifts can change. */
export async function setGiftStatus(guards: Guards, form: FormData, gifts: { id: number; name: string }[]): Promise<Result> {
	const parsed = z.object({ giftId: z.coerce.number().int().positive(), status: z.enum(['idea', 'offered', 'received']), updatedAt: z.string().min(1).max(40) }).safeParse({ giftId: form.get('giftId'), status: form.get('status'), updatedAt: form.get('updatedAt') });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const gift = gifts.find((g) => g.id === parsed.data.giftId);
	if (!gift) return { ok: false, dryRun: false, message: 'That gift is not on this contact any more. Reload the page.' };
	try {
		const res = await guards.update('gift.status', gift.id, { status: parsed.data.status }, parsed.data.updatedAt);
		const word = { idea: 'back to an idea', offered: 'given', received: 'received' }[parsed.data.status];
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: it is in the audit log; nothing was sent.' : `Marked “${gift.name}” ${word}.` };
	} catch (err) {
		return { ok: false, dryRun: false, message: `Not changed: ${why(err)}.` };
	}
}
