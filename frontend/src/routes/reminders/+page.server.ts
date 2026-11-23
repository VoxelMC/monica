import { fail } from '@sveltejs/kit';
import { listContacts } from '#lib/server/monica/contacts.js';
import { getDb, monica, settings } from '#lib/server/monica/index.js';
import { createReminder, deleteReminder, markDone, openReminders, recentlyDone, snooze, type ReminderResult } from '#lib/server/reminders.js';
import type { Actions, PageServerLoad } from './$types';

// Timed reminders (orbit's own database; nothing here writes to Monica).
// The contact page and Home post to these actions too.
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDb();
	return { open: openReminders(db), done: recentlyDone(db), ntfyConfigured: settings.ntfyConfigured };
};

const respond = (r: ReminderResult) => (r.ok ? r : fail(400, r));

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		return respond(
			await createReminder(getDb(), form, async (id) => (await listContacts(monica)).find((c) => c.id === id)?.name ?? null)
		);
	},
	done: async ({ request }) => respond(markDone(getDb(), await request.formData())),
	snooze: async ({ request }) => respond(snooze(getDb(), await request.formData())),
	remove: async ({ request }) => respond(deleteReminder(getDb(), await request.formData()))
};
