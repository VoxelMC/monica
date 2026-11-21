import { error } from '@sveltejs/kit';
import { listContacts, listTagNames } from '#lib/server/monica/contacts.js';
import { monica } from '#lib/server/monica/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, tagNames] = await Promise.all([listContacts(monica), listTagNames(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, tagNames };
	} catch (err) {
		console.error('tags page failed:', err instanceof Error ? err.message : err);
		error(502, 'Could not load tags from Monica.');
	}
};
