// Read-only until slice 4: no form action, so nothing can be sent to Monica from here.
import { error } from '@sveltejs/kit';
import { listBirthdayBases } from '#lib/server/monica/birthdays.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { monica } from '#lib/server/monica/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, bases] = await Promise.all([listContacts(monica), listBirthdayBases(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, bases };
	} catch (err) {
		console.error('birthdays page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'birthdays'));
	}
};
