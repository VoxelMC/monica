// Birthdays page (read-only for now). Reuses the cached contact list request, so
// this costs Monica no extra calls beyond GET /api/genders (also cached).
import { z } from 'zod';
import type { BirthdayBase } from '../../birthday-write';
import { parseBirthday } from '../../contact';
import { displayName } from '../../contacts';
import type { MonicaClient } from './client';
import { contactListItem, specialDate } from './schemas';

const withWriteFields = contactListItem.extend({
	description: z.string().nullable().optional(),
	gender: z.string().nullable().optional(),
	is_dead: z.boolean().optional(),
	information: z.looseObject({
		avatar: z.looseObject({ url: z.string().nullable(), source: z.string().nullable(), default_avatar_color: z.string().nullable().optional() }),
		dates: z.looseObject({ birthdate: specialDate.optional(), deceased_date: specialDate.optional() }).optional()
	})
});
const gender = z.looseObject({ id: z.number().int(), name: z.string() });

/** Everything needed to build a birthday update that changes nothing else. */
export async function listBirthdayBases(client: MonicaClient): Promise<BirthdayBase[]> {
	const [contacts, genders] = await Promise.all([
		client.getAll('/api/contacts', withWriteFields, { with: 'contactfields' }),
		client.getAll('/api/genders', gender)
	]);
	const genderId = new Map(genders.map((g) => [g.name, g.id]));
	return contacts
		.filter((c) => !c.is_partial && c.is_active)
		.map((c) => {
			const dd = parseBirthday(c.information.dates?.deceased_date);
			return {
				id: c.id,
				name: displayName(c.first_name, c.last_name, c.complete_name),
				firstName: c.first_name ?? c.complete_name,
				description: c.description ?? null,
				genderId: c.gender ? (genderId.get(c.gender) ?? null) : null,
				isDead: !!c.is_dead,
				deceased: dd ? { day: dd.day, month: dd.month, year: dd.year } : null
			};
		});
}
