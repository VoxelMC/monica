import { error } from '@sveltejs/kit';
import { loadDiary } from '#lib/server/monica/diary.js';
import { monica } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const items = await loadDiary(monica);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { items };
	} catch (err) {
		console.error('diary failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'the diary'));
	}
};
