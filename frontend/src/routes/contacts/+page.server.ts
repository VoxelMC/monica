import { error, fail } from '@sveltejs/kit';
import { saveTags } from '#lib/server/tags-save.js';
import { getGuards, monica, settings } from '#lib/server/monica/index.js';
import { listContacts, listTags } from '#lib/server/monica/contacts.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const contacts = await listContacts(monica);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, readOnly: settings.readOnly, dryRun: settings.dryRun };
	} catch (err) {
		console.error('contacts list failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'contacts'));
	}
};

export const actions: Actions = {
	// Add or remove one tag on the selected people (see tags-save.ts)
	tags: async ({ request }) => {
		let raw: unknown;
		try {
			raw = JSON.parse(String((await request.formData()).get('draft') ?? ''));
		} catch {
			return fail(400, { ok: false, done: [], skipped: 0, dryRun: false, message: 'The form could not be read. Reload the page and try again.' });
		}
		const [contacts, tags] = await Promise.all([listContacts(monica), listTags(monica)]);
		const result = await saveTags(getGuards(), raw, contacts, tags);
		return result.ok ? result : fail(400, result);
	}
};
