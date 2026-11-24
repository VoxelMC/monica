import { error, fail, redirect } from '@sveltejs/kit';
import { listGroups } from '#lib/server/groups.js';
import { listContacts } from '#lib/server/monica/contacts.js';
import { loadErrorMessage } from '#lib/server/monica/errors.js';
import { getDb, monica } from '#lib/server/monica/index.js';
import { addPeople, deleteTrip, getTrip, updateItem, updateTrip } from '#lib/server/trips.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const id = /^\d{1,10}$/.test(params.id) ? Number(params.id) : null;
	const trip = id ? getTrip(getDb(), id) : null;
	if (!trip) error(404, 'Trip not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const contacts = await listContacts(monica);
		return { trip, contacts, groups: listGroups(getDb()).filter((g) => g.members.length) };
	} catch (err) {
		error(502, loadErrorMessage(err, 'this trip'));
	}
};

export const actions: Actions = {
	update: async ({ params, request }) => {
		const r = updateTrip(getDb(), Number(params.id), await request.formData());
		return r.ok ? r : fail(400, r);
	},
	add: async ({ params, request }) => {
		const form = await request.formData();
		let known: Set<number>;
		try {
			known = new Set((await listContacts(monica)).map((c) => c.id));
		} catch (err) {
			return fail(503, { ok: false, message: loadErrorMessage(err, 'contacts') });
		}
		const r = addPeople(getDb(), Number(params.id), form, known);
		return r.ok ? r : fail(400, r);
	},
	item: async ({ params, request }) => {
		const r = updateItem(getDb(), Number(params.id), await request.formData());
		return r.ok ? r : fail(400, r);
	},
	delete: async ({ params, request }) => {
		const r = deleteTrip(getDb(), Number(params.id), await request.formData());
		if (!r.ok) return fail(400, r);
		redirect(303, '/trips');
	}
};
