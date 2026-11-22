import { error, fail } from '@sveltejs/kit';
import { removeEntry } from '#lib/server/remove-entry.js';
import { ContactNotFound, loadContactPage } from '#lib/server/monica/contact-page.js';
import { getGuards, monica, settings } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!/^\d{1,10}$/.test(params.id)) error(404, 'Contact not found');
	try {
		const contact = await loadContactPage(monica, Number(params.id));
		setHeaders({ 'cache-control': 'private, no-store' });
		return {
			contact,
			monicaLink: settings.publicMonicaUrl ? `${settings.publicMonicaUrl}/people/${encodeURIComponent(contact.hashId)}` : null
		};
	} catch (err) {
		if (err instanceof ContactNotFound) error(404, 'Contact not found');
		console.error('contact page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'this contact'));
	}
};

export const actions: Actions = {
	// Remove a hangout, note or journal entry (confirmed in the UI; see remove-entry.ts)
	remove: async ({ request }) => {
		const result = await removeEntry(getGuards(), await request.formData());
		return result.ok ? result : fail(400, result);
	}
};
