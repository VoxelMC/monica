import { error, fail } from '@sveltejs/kit';
import { listContacts, listTags } from '#lib/server/monica/contacts.js';
import { getGuards, monica } from '#lib/server/monica/index.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { mergeTags, renameTag } from '#lib/server/tags-save.js';
import { moveTagColour, setTagColour } from '#lib/server/tag-colours.js';
import { getDb } from '#lib/server/monica/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
	try {
		const [contacts, tags] = await Promise.all([listContacts(monica), listTags(monica)]);
		setHeaders({ 'cache-control': 'private, no-store' });
		return { contacts, tags, tagNames: tags.map((t) => t.name) };
	} catch (err) {
		console.error('tags page failed:', err instanceof Error ? err.message : err);
		error(502, loadErrorMessage(err, 'tags'));
	}
};

export const actions: Actions = {
	// Rename one tag (tag.rename; see tags-save.ts)
	rename: async ({ request }) => {
		const form = await request.formData();
		let tags;
		try {
			tags = await listTags(monica);
		} catch (err) {
			return fail(503, { ok: false, dryRun: false, message: `${loadErrorMessage(err, 'tags')} Nothing was changed.` });
		}
		const result = await renameTag(getGuards(), form, tags);
		// The tag keeps its orbit colour under its new name
		const old = tags.find((t) => t.id === Number(form.get('tagId')));
		if (result.ok && !result.dryRun && old) moveTagColour(getDb(), old.name, String(form.get('name') ?? '').trim().replace(/\s+/g, ' '));
		return result.ok ? result : fail(400, result);
	},
	// Pick one of the theme's six colours for a tag, or 0 = automatic (orbit's DB only)
	colour: async ({ request }) => {
		const result = setTagColour(getDb(), await request.formData());
		return result.ok ? { ...result, local: true } : fail(400, { ...result, local: true });
	},
	// Merge tag A into B: add B, then remove A, per person (approved tag writes)
	merge: async ({ request }) => {
		const form = await request.formData();
		let contacts, tags;
		try {
			[contacts, tags] = await Promise.all([listContacts(monica), listTags(monica)]);
		} catch (err) {
			return fail(503, { ok: false, dryRun: false, moved: 0, message: `${loadErrorMessage(err, 'tags')} Nothing was changed.` });
		}
		const result = await mergeTags(getGuards(), form, contacts, tags);
		return result.ok ? result : fail(400, result);
	}
};
