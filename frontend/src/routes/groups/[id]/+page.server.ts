import { error, fail, redirect } from '@sveltejs/kit';
import { groupStats } from '#lib/groups.js';
import { groupInputs } from '#lib/server/group-data.js';
import { deleteGroup, getGroup, renameGroup, setMembers } from '#lib/server/groups.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { getDb, monica } from '#lib/server/monica/index.js';
import type { Actions, PageServerLoad } from './$types';

const idOf = (p: string) => (/^\d{1,10}$/.test(p) ? Number(p) : null);

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const id = idOf(params.id);
	const group = id ? getGroup(getDb(), id) : null;
	if (!group) error(404, 'Group not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const { contacts, hangouts } = await groupInputs();
		return { group, stats: groupStats(group.members, contacts, hangouts), contacts };
	} catch (err) {
		error(502, loadErrorMessage(err, 'this group'));
	}
};

async function known() {
	return new Set((await listContacts(monica)).map((c) => c.id));
}

export const actions: Actions = {
	rename: async ({ params, request }) => {
		const r = renameGroup(getDb(), Number(params.id), await request.formData());
		return r.ok ? r : fail(400, r);
	},
	members: async ({ params, request }) => {
		const form = await request.formData();
		let ids: Set<number>;
		try {
			ids = await known();
		} catch (err) {
			return fail(503, { ok: false, message: loadErrorMessage(err, 'contacts') });
		}
		const r = setMembers(getDb(), Number(params.id), form, ids);
		return r.ok ? r : fail(400, r);
	},
	delete: async ({ params, request }) => {
		const r = deleteGroup(getDb(), Number(params.id), await request.formData());
		if (!r.ok) return fail(400, r);
		redirect(303, '/groups');
	}
};
