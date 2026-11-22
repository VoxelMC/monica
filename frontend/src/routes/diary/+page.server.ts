import { error, fail } from '@sveltejs/kit';
import { removeEntry } from '#lib/server/remove-entry.js';
import { loadDiary } from '#lib/server/monica/diary.js';
import { forgetEntry, mentionsByEntry } from '#lib/server/journal-save.js';
import { getDb, getGuards, monica, settings } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const loaded = await loadDiary(monica);
		// Journal entries: people orbit recorded as mentioned
		const links = mentionsByEntry(getDb(), loaded.filter((i) => i.kind === 'journal').map((i) => i.id));
		const items = loaded.map((i) => (i.kind === 'journal' ? { ...i, people: (links.get(i.id) ?? []).map((m) => ({ id: m.contactId, name: m.name, hashId: null as string | null })) } : i));
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
		const form = await request.formData();
		const result = await removeEntry(getGuards(), form);
		if (result.ok && !result.dryRun && form.get('kind') === 'journal') forgetEntry(getDb(), Number(form.get('id')));
		return result.ok ? result : fail(400, result);
	}
};
