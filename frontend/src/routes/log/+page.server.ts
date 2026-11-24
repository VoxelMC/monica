import { error, fail } from '@sveltejs/kit';
import { todayIso } from '#lib/log.js';
import { saveJournal } from '#lib/server/journal-save.js';
import { saveHangout } from '#lib/server/log-write.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { listActivityTypes } from '#lib/server/monica/diary.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { getDb, getGuards, monica, settings } from '#lib/server/monica/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [contacts, types] = await Promise.all([listContacts(monica), listActivityTypes(monica)]);
		return { contacts, types, readOnly: settings.readOnly, dryRun: settings.dryRun };
	} catch (err) {
		console.error('log page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'people'));
	}
};

export const actions: Actions = {
	// Slice 4: save a hangout through the write guards. Journal entries are not saved yet.
	hangout: async ({ request }) => {
		const form = await request.formData();
		let draft: unknown;
		try {
			draft = JSON.parse(String(form.get('draft') ?? ''));
		} catch {
			return fail(400, { ok: false, message: 'The form could not be read. Reload the page and try again.' });
		}
		let contacts, types;
		try {
			[contacts, types] = await Promise.all([listContacts(monica), listActivityTypes(monica)]);
		} catch (err) {
			return fail(503, { ok: false, message: `${loadErrorMessage(err, 'contacts')} Nothing was saved.`, dryRun: false, activityId: null, notes: [] });
		}
		// The server runs in UTC; allow "today" in time zones ahead of it.
		const tomorrow = todayIso(new Date(Date.now() + 86_400_000));
		const result = await saveHangout(
			getGuards(),
			draft,
			{ contactIds: new Set(contacts.map((c) => c.id)), activityTypeIds: new Set(types.map((t) => t.id)) },
			tomorrow
		);
		return result.ok ? result : fail(result.activityId ? 502 : 400, result);
	},
	// Journal entry: readable text to Monica, mention links in orbit's database
	journal: async ({ request }) => {
		let raw: unknown;
		try {
			raw = JSON.parse(String((await request.formData()).get('draft') ?? ''));
		} catch {
			return fail(400, { ok: false, message: 'The form could not be read. Reload the page and try again.', entryId: null, dryRun: false });
		}
		let contacts;
		try {
			contacts = await listContacts(monica);
		} catch (err) {
			return fail(503, { ok: false, message: `${loadErrorMessage(err, 'contacts')} The entry was not saved.`, entryId: null, dryRun: false });
		}
		const result = await saveJournal(getGuards(), getDb(), raw, new Set(contacts.map((c) => c.id)));
		return result.ok ? result : fail(result.entryId ? 502 : 400, result);
	}
};
