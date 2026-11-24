import { error, fail, redirect } from '@sveltejs/kit';
import { groupStats } from '#lib/groups.js';
import { groupInputs } from '#lib/server/group-data.js';
import { createGroup, listGroups } from '#lib/server/groups.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { getDb } from '#lib/server/monica/index.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { monica } from '#lib/server/monica/index.js';
import type { Actions, PageServerLoad } from './$types';

// Friend groups (orbit's own data). Stats come from Monica's activities.
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const { contacts, hangouts } = await groupInputs();
		const groups = listGroups(getDb()).map((g) => ({ ...g, stats: groupStats(g.members, contacts, hangouts) }));
		return { groups, contacts };
	} catch (err) {
		error(502, loadErrorMessage(err, 'groups'));
	}
};

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		let known: Set<number>;
		try {
			known = new Set((await listContacts(monica)).map((c) => c.id));
		} catch (err) {
			return fail(503, { ok: false, message: loadErrorMessage(err, 'contacts') });
		}
		const r = createGroup(getDb(), form, known);
		if (!r.ok) return fail(400, r);
		redirect(303, `/groups/${r.id}`);
	}
};
