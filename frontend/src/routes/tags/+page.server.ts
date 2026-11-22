import { error } from '@sveltejs/kit';
import { listContacts, listTagNames } from '#lib/server/monica/contacts.js';
import { monica } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, tagNames] = await Promise.all([listContacts(monica), listTagNames(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, tagNames };
	} catch (err) {
		console.error('tags page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'tags'));
	}
};
