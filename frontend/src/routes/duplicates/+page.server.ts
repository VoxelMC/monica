import { error, fail } from '@sveltejs/kit';
import { getDb, getGuards, monica } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { loadDuplicates, mergeDuplicate } from '#lib/server/duplicates.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const groups = await loadDuplicates(monica);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { groups };
	} catch (err) {
		console.error('duplicates page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'duplicates'));
	}
};

export const actions: Actions = {
	// Merge one copy into the person kept (owner confirms each one on screen)
	merge: async ({ request }) => {
		const result = await mergeDuplicate(getGuards(), getDb(), monica, await request.formData());
		return result.ok ? result : fail(400, result);
	}
};
