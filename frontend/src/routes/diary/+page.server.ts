import { error, fail } from '@sveltejs/kit';
import { removeEntry } from '#lib/server/remove-entry.js';
import { loadDiary } from '#lib/server/monica/diary.js';
import { getGuards, monica, settings } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const items = await loadDiary(monica);
		setHeaders({ 'cache-control': 'private, no-store' });
		// Removing entries happens in Monica (orbit never deletes): link each item there.
		return { items, monicaUrl: settings.publicMonicaUrl ?? null };
	} catch (err) {
		console.error('diary failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'the diary'));
	}
};

export const actions: Actions = {
	// Remove a hangout, note or journal entry (confirmed in the UI; see remove-entry.ts)
	remove: async ({ request }) => {
		const result = await removeEntry(getGuards(), await request.formData());
		return result.ok ? result : fail(400, result);
	}
};
