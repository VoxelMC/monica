import { error } from '@sveltejs/kit';
import { monica } from '#lib/server/monica/index.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { MonicaError } from '#lib/server/monica/errors.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const contacts = await listContacts(monica);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts };
	} catch (err) {
		console.error('contacts list failed:', err instanceof Error ? err.message : err);
		error(502, err instanceof MonicaError ? 'Could not load contacts from Monica.' : 'Could not load contacts.');
	}
};
