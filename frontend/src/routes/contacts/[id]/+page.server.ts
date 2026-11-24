import { error, fail } from '@sveltejs/kit';
import { removeEntry } from '#lib/server/remove-entry.js';
import { savePhoto } from '#lib/server/photo-save.js';
import { addNote } from '#lib/server/note-save.js';
import { addField, editField } from '#lib/server/contact-fields-save.js';
import { contactField } from '#lib/server/monica/schemas.js';
import { z } from 'zod';
import { changeBirthday } from '#lib/server/birthday-save.js';
import { reminder } from '#lib/server/monica/schemas.js';
import { openReminders } from '#lib/server/reminders.js';
import { addTagsToContact, saveTags } from '#lib/server/tags-save.js';
import { listContacts, listTagNames, listTags } from '#lib/server/monica/contacts.js';
import { ContactNotFound, loadContactPage } from '#lib/server/monica/contact-page.js';
import { entriesMentioning } from '#lib/server/journal-save.js';
import { journalEntry } from '#lib/server/monica/schemas.js';
import { getDb, getGuards, monica, settings } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	if (!/^\d{1,10}$/.test(params.id)) error(404, 'Contact not found');
	try {
		const [contact, allTags] = await Promise.all([
			loadContactPage(monica, Number(params.id)),
			listTagNames(monica).catch(() => [] as string[]) // suggestions only; the page works without them
		]);
		// Journal entries orbit linked to this person (exact links from its own database)
		const ids = new Set(entriesMentioning(getDb(), contact.id));
		const mentionedIn = ids.size
			? (await monica.getAll('/api/journal', journalEntry)).filter((e) => ids.has(e.id)).map((e) => ({ id: e.id, title: e.title ?? 'Journal entry', date: e.date || e.created_at }))
			: [];
		setHeaders({ 'cache-control': 'private, no-store' });
		return {
			contact,
			mentionedIn,
			allTags,
			timedReminders: openReminders(getDb(), contact.id),
			ntfyConfigured: settings.ntfyConfigured,
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
	},
	// Add tags (one or several) to this person, or remove one (same guarded writes as bulk tags; see tags-save.ts)
	tag: async ({ params, request }) => {
		const form = await request.formData();
		const id = Number(params.id);
		let contacts, tags;
		try {
			[contacts, tags] = await Promise.all([listContacts(monica), listTags(monica)]);
		} catch (err) {
			return fail(503, { ok: false, done: [], skipped: 0, dryRun: false, message: `${loadErrorMessage(err, 'tags')} Nothing was changed.` });
		}
		const result =
			form.get('mode') === 'add'
				? await addTagsToContact(getGuards(), id, form.getAll('tag').map(String), contacts, tags) // several at once
				: await saveTags(getGuards(), { mode: form.get('mode'), contactIds: [id], tag: String(form.get('tag') ?? '') }, contacts, tags);
		return result.ok ? result : fail(400, result);
	},
	// Correct an existing birthday (see changeBirthday). Monica's birthday reminder is the
	// one it marks non-deletable; keep a yearly reminder only if there is one now.
	birthday: async ({ params, request }) => {
		const form = await request.formData();
		form.set('contactId', params.id); // the page's contact, never one from the form
		let hadReminder: boolean;
		try {
			hadReminder = (await monica.getAll(`/api/contacts/${Number(params.id)}/reminders`, reminder)).some((r) => (r as { delible?: boolean }).delible === false);
		} catch {
			return fail(400, { ok: false, dryRun: false, message: 'Monica could not be reached. Nothing was changed.' });
		}
		const result = await changeBirthday(getGuards(), form, hadReminder);
		return result.ok ? result : fail(400, result);
	},
	// Add a note (POST /api/notes, same approved write as hangout notes)
	note: async ({ params, request }) => {
		const form = await request.formData();
		form.set('contactId', params.id);
		const result = await addNote(getGuards(), form);
		return result.ok ? result : fail(400, result);
	},
	// Add a phone or email (contactfield.create)
	fieldAdd: async ({ params, request }) => {
		const form = await request.formData();
		let types: { id: number; type: string | null }[];
		try {
			types = await monica.getAll('/api/contactfieldtypes', z.looseObject({ id: z.number().int(), type: z.string().nullable() }));
		} catch {
			return fail(400, { ok: false, dryRun: false, message: 'Monica could not be reached. Nothing was added.' });
		}
		const result = await addField(getGuards(), Number(params.id), form, types);
		return result.ok ? result : fail(400, result);
	},
	// Correct one of this person's phones or emails (contactfield.update)
	fieldEdit: async ({ params, request }) => {
		const form = await request.formData();
		let fields: { id: number; type: string | null; content: string }[];
		try {
			fields = (await monica.getAll(`/api/contacts/${Number(params.id)}/contactfields`, contactField)).map((f) => ({ id: f.id, type: f.contact_field_type.type, content: f.content }));
		} catch {
			return fail(400, { ok: false, dryRun: false, message: 'Monica could not be reached. Nothing was changed.' });
		}
		const result = await editField(getGuards(), form, fields);
		return result.ok ? result : fail(400, result);
	},
	// Change the profile photo (upload + set as avatar; see photo-save.ts)
	photo: async ({ request }) => {
		const result = await savePhoto(getGuards(), await request.formData());
		return result.ok ? result : fail(400, result);
	}
};
