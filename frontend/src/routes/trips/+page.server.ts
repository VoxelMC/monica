import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/monica/index.js';
import { createTrip, listTrips } from '#lib/server/trips.js';
import type { Actions, PageServerLoad } from './$types';

// Souvenir lists per trip (orbit's own data).
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	return { trips: listTrips(getDb()) };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const r = createTrip(getDb(), await request.formData());
		if (!r.ok) return fail(400, r);
		redirect(303, `/trips/${r.id}`);
	}
};
