// Data for the group pages: Monica contacts (with catch-up targets) and hangouts.
import type { Hangout } from '../groups';
import { catchupTargets, withTargets } from './catchup';
import { listContacts } from './monica/contacts';
import { getDb, monica } from './monica/index';
import { activityWithAttendees } from './monica/schemas';

export async function groupInputs() {
	const [contacts, activities] = await Promise.all([listContacts(monica), monica.getAll('/api/activities', activityWithAttendees)]);
	const hangouts: Hangout[] = activities.map((a) => ({
		id: a.id,
		date: a.happened_at,
		title: a.summary || a.activity_type?.name || 'Hangout',
		people: (a.attendees?.contacts ?? []).map((c) => c.id)
	}));
	return { contacts: withTargets(contacts, catchupTargets(getDb())), hangouts };
}
