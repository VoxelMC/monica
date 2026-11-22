import { error } from '@sveltejs/kit';
import { ContactNotFound, loadContactPage } from '#lib/server/monica/contact-page.js';
import { monica, settings } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { PageServerLoad } from './$types';

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
