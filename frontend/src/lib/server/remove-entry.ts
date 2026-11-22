// Removing a hangout, note or journal entry (owner decision 2026-11-23).
// Only through guards.remove: allowlisted path, full record saved to the audit
// log first, conflict check on updated_at. Contacts can never be removed.
import { ConflictError, MonicaError, MonicaHttpError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

export const REMOVABLE = { activity: 'activity.delete', note: 'note.delete', journal: 'journal.delete' } as const;
export type RemovableKind = keyof typeof REMOVABLE;
const label: Record<RemovableKind, string> = { activity: 'hangout', note: 'note', journal: 'journal entry' };

export interface RemoveResult {
	ok: boolean;
	message: string;
	dryRun: boolean;
}

export async function removeEntry(guards: Guards, form: FormData): Promise<RemoveResult> {
	const kind = String(form.get('kind') ?? '') as RemovableKind;
	const id = Number(form.get('id'));
	const updatedAt = String(form.get('updatedAt') ?? '');
	const confirmed = form.get('confirm') === 'yes';
	if (!(kind in REMOVABLE) || !Number.isInteger(id) || id <= 0 || !updatedAt) {
		return { ok: false, dryRun: false, message: 'That could not be removed (missing details). Reload and try again.' };
	}
	// The confirmation checkbox is part of the request; no tick, no removal.
	if (!confirmed) return { ok: false, dryRun: false, message: 'Tick the box to confirm, then remove.' };
	try {
		const res = await guards.remove(REMOVABLE[kind], id, updatedAt);
		return res.dryRun
			? { ok: true, dryRun: true, message: `Dry run: the ${label[kind]} was not removed. The audit log shows what would have been.` }
			: { ok: true, dryRun: false, message: `Removed the ${label[kind]}. A copy is in the audit log.` };
	} catch (err) {
		const what = label[kind];
		let message = `Something went wrong; the ${what} was not removed.`;
		if (err instanceof ConflictError) message = `The ${what} changed in Monica since this page loaded, so it was not removed. Reload and check it first.`;
		else if (err instanceof WriteRefusedError && err.reason === 'read-only') message = `orbit is read-only (ORBIT_READ_ONLY=true); the ${what} was not removed.`;
		else if (err instanceof WriteRefusedError) message = `orbit refused this (${err.reason}); the ${what} was not removed.`;
		else if (err instanceof MonicaHttpError && err.status === 404) message = `That ${what} is already gone from Monica.`;
		else if (err instanceof MonicaError) message = `${err.message}. The ${what} may not have been removed; check the audit log.`;
		return { ok: false, dryRun: false, message };
	}
}
