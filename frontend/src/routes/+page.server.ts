import { error } from '@sveltejs/kit';
import { listContacts, listOpenTasks } from '#lib/server/monica/contacts.js';
import { getDb, monica, settings } from '#lib/server/monica/index.js';
import { openReminders } from '#lib/server/reminders.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, tasks] = await Promise.all([listContacts(monica), listOpenTasks(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, tasks, reminders: openReminders(getDb()).slice(0, 8), ntfyConfigured: settings.ntfyConfigured };
	} catch (err) {
		console.error('dashboard failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'the dashboard'));
	}
};
