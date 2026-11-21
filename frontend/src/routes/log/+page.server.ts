// Read-only until slice 4: loads what the form needs. There is deliberately no
// form action here, so nothing can be sent to Monica from this page yet.
import { error } from '@sveltejs/kit';
import { listContacts } from '#lib/server/monica/contacts.js';
import { listActivityTypes } from '#lib/server/monica/diary.js';
import { monica } from '#lib/server/monica/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [contacts, types] = await Promise.all([listContacts(monica), listActivityTypes(monica)]);
		return { contacts, types };
	} catch (err) {
		console.error('log page failed:', err instanceof Error ? err.message : err);
		error(502, 'Could not load people from Monica.');
	}
};
