// Add a phone or email, or correct one (contact page, 2026-11-24). Through the
// guards (contactfield.create / contactfield.update). Never removes one.
import { z } from 'zod';
import { checkField } from '../contact-fields';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

type Result = { ok: boolean; message: string; dryRun: boolean };
const kind = z.enum(['phone', 'email']);

function why(err: unknown): string {
	if (err instanceof ConflictError) return 'it changed in Monica since this page loaded. Reload and try again';
	if (err instanceof WriteRefusedError && err.reason === 'read-only') return 'orbit is read-only (ORBIT_READ_ONLY=true)';
	if (err instanceof WriteRefusedError) return `orbit refused it (${err.reason})`;
	if (err instanceof MonicaError) return err.message;
	return 'something went wrong';
}

/** `types`: Monica's contact field types (GET /api/contactfieldtypes). */
export async function addField(guards: Guards, contactId: number, form: FormData, types: { id: number; type: string | null }[]): Promise<Result> {
	const parsed = z.object({ kind, value: z.string().max(1000) }).safeParse({ kind: form.get('kind'), value: form.get('value') ?? '' });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const checked = checkField(parsed.data.kind, parsed.data.value);
	if ('error' in checked) return { ok: false, dryRun: false, message: checked.error };
	const type = types.find((t) => t.type === parsed.data.kind);
	if (!type) return { ok: false, dryRun: false, message: `Monica has no ${parsed.data.kind} field type.` };
	try {
		const res = await guards.create('contactfield.create', { contact_id: contactId, contact_field_type_id: type.id, data: checked.value });
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: it is in the audit log; nothing was sent.' : `Added ${checked.value}. Your phone gets it on its next sync.` };
	} catch (err) {
		return { ok: false, dryRun: false, message: `Not added: ${why(err)}.` };
	}
}

/** `fields`: this contact's fields as Monica has them now, so only its own phones/emails can be changed. */
export async function editField(guards: Guards, form: FormData, fields: { id: number; type: string | null; content: string }[]): Promise<Result> {
	const parsed = z.object({ fieldId: z.coerce.number().int().positive(), value: z.string().max(1000), updatedAt: z.string().min(1).max(40) }).safeParse({ fieldId: form.get('fieldId'), value: form.get('value') ?? '', updatedAt: form.get('updatedAt') });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const field = fields.find((f) => f.id === parsed.data.fieldId);
	if (!field || (field.type !== 'phone' && field.type !== 'email')) return { ok: false, dryRun: false, message: 'That phone or email is not on this contact any more. Reload the page.' };
	const checked = checkField(field.type, parsed.data.value);
	if ('error' in checked) return { ok: false, dryRun: false, message: checked.error };
	if (checked.value === field.content) return { ok: false, dryRun: false, message: 'Nothing changed.' };
	try {
		const res = await guards.update('contactfield.update', field.id, { data: checked.value }, parsed.data.updatedAt);
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: it is in the audit log; nothing was sent.' : `Changed to ${checked.value}. Your phone gets it on its next sync.` };
	} catch (err) {
		return { ok: false, dryRun: false, message: `Not changed: ${why(err)}.` };
	}
}
