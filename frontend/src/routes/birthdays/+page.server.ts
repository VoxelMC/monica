import { error, fail } from '@sveltejs/kit';
import { saveBirthdays } from '#lib/server/birthday-save.js';
import { listBirthdayBases } from '#lib/server/monica/birthdays.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { getGuards, monica, settings } from '#lib/server/monica/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, bases] = await Promise.all([listContacts(monica), listBirthdayBases(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, bases, readOnly: settings.readOnly, dryRun: settings.dryRun };
	} catch (err) {
		console.error('birthdays page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'birthdays'));
	}
};

export const actions: Actions = {
	// Save birthdays: one guarded fetch-merge-send per person (see birthday-save.ts)
	save: async ({ request }) => {
		let raw: unknown;
		try {
			raw = JSON.parse(String((await request.formData()).get('draft') ?? ''));
		} catch {
			return fail(400, { ok: false, saved: [], dryRun: false, message: 'The form could not be read. Reload the page and try again.' });
		}
		let contacts;
		try {
			contacts = await listContacts(monica);
		} catch (err) {
			return fail(503, { ok: false, saved: [], dryRun: false, message: `${loadErrorMessage(err, 'contacts')} Nothing was saved.` });
		}
		const result = await saveBirthdays(getGuards(), raw, new Map(contacts.map((c) => [c.id, c.name])), new Date(Date.now() + 86_400_000));
		return result.ok ? result : fail(400, result);
	}
};
