import { z } from 'zod';

// Zod schemas for Monica 4.1.2 responses, checked against staging on 2026-11-21.
// Records use looseObject so unknown fields are kept, not stripped: fetch-merge-send
// must never lose a field just because orbit does not know about it yet.

export const paginationMeta = z.looseObject({
	current_page: z.number().int().min(1),
	last_page: z.number().int().min(1),
	per_page: z.number().int(),
	total: z.number().int().min(0)
});

/** A page from a list endpoint: { data: T[], links, meta }. `links` is ignored on purpose. */
export function paginated<T extends z.ZodType>(item: T) {
	return z.looseObject({
		data: z.array(item),
		meta: paginationMeta
	});
}

/** A single-record response: { data: T }. */
export function single<T extends z.ZodType>(item: T) {
	return z.looseObject({ data: item });
}

export const currency = z.looseObject({
	id: z.number().int(),
	iso: z.string(),
	name: z.string(),
	symbol: z.string()
});

/** GET /api/me */
export const user = z.looseObject({
	id: z.number().int(),
	object: z.literal('user'),
	first_name: z.string().nullable(),
	last_name: z.string().nullable(),
	name: z.string(),
	email: z.string(),
	timezone: z.string().nullable(),
	locale: z.string().nullable(),
	currency: currency.nullable(),
	account: z.looseObject({ id: z.number().int() }),
	created_at: z.string(),
	updated_at: z.string()
});
export type User = z.infer<typeof user>;

/** Minimal contact shape (GET /api/contacts). Slice 1 will extend this. */
export const contactSummary = z.looseObject({
	id: z.number().int(),
	object: z.literal('contact'),
	first_name: z.string().nullable(),
	last_name: z.string().nullable(),
	nickname: z.string().nullable(),
	complete_name: z.string(),
	initials: z.string(),
	updated_at: z.string()
});
export type ContactSummary = z.infer<typeof contactSummary>;

export const tag = z.looseObject({
	id: z.number().int(),
	name: z.string(),
	name_slug: z.string().nullable().optional()
});

export const contactField = z.looseObject({
	id: z.number().int(),
	content: z.string(),
	contact_field_type: z.looseObject({
		id: z.number().int(),
		name: z.string(),
		type: z.string().nullable(), // 'phone' | 'email' | null for custom types
		protocol: z.string().nullable().optional()
	})
});

/** Monica serialises dates as ISO strings; tolerate the PHP DateTime object shape too. */
const looseDate = z
	.union([z.string(), z.looseObject({ date: z.string() }), z.null()])
	.optional()
	.transform((v) => (v == null ? null : typeof v === 'string' ? v : v.date));

/** GET /api/contacts?with=contactfields (list item). */
export const contactListItem = contactSummary.extend({
	is_starred: z.boolean(),
	is_partial: z.boolean(),
	is_active: z.boolean(),
	tags: z.array(tag).default([]),
	information: z.looseObject({
		avatar: z.looseObject({
			url: z.string().nullable(),
			source: z.string().nullable(),
			default_avatar_color: z.string().nullable().optional()
		}),
		dates: z
			.looseObject({
				birthdate: z
					.looseObject({ is_age_based: z.boolean().nullable().optional(), is_year_unknown: z.boolean().nullable().optional(), date: z.string().nullable().optional() })
					.optional()
			})
			.optional()
	}),
	last_called: looseDate,
	last_activity_together: looseDate,
	is_dead: z.boolean().optional(),
	stay_in_touch_frequency: z.number().int().nullable().optional(),
	stay_in_touch_trigger_date: looseDate,
	created_at: z.string(),
	contactFields: z.array(contactField).optional()
});
export type ContactListItem = z.infer<typeof contactListItem>;

/** GET /api/contacts/{id}/photos (item). */
export const photo = z.looseObject({
	id: z.number().int(),
	new_filename: z.string(),
	mime_type: z.string(),
	dataUrl: z.string()
});

// ---- Contact page (slice 2). Shapes from Monica 4.1.2's API resources; most were
// empty on staging, so optional/nullable is generous and objects stay loose.

const nstr = z.string().nullable().optional();

export const contactShort = z.looseObject({
	id: z.number().int(),
	hash_id: z.string().nullable().optional(),
	first_name: z.string().nullable().optional(),
	last_name: z.string().nullable().optional(),
	complete_name: z.string(),
	initials: z.string().optional(),
	is_partial: z.boolean().optional()
});

export const specialDate = z.looseObject({
	is_age_based: z.boolean().nullable().optional(),
	is_year_unknown: z.boolean().nullable().optional(),
	date: nstr
});

const relationshipGroup = z
	.looseObject({
		total: z.number().int(),
		contacts: z
			.array(z.looseObject({ relationship: z.looseObject({ name: z.string() }), contact: contactShort }))
			.nullable()
			.optional()
	})
	.optional();

export const address = z.looseObject({
	id: z.number().int(),
	name: nstr,
	street: nstr,
	city: nstr,
	province: nstr,
	postal_code: nstr,
	country: z.looseObject({ name: nstr }).nullable().optional()
});

/** GET /api/contacts/{id}?with=contactfields */
export const contactDetail = contactListItem.extend({
	hash_id: z.string(),
	description: nstr,
	is_dead: z.boolean(),
	information: z.looseObject({
		avatar: z.looseObject({ url: z.string().nullable(), source: z.string().nullable(), default_avatar_color: nstr }),
		dates: z.looseObject({ birthdate: specialDate, deceased_date: specialDate.optional() }),
		career: z.looseObject({ job: nstr, company: nstr }).optional(),
		relationships: z
			.looseObject({ love: relationshipGroup, family: relationshipGroup, friend: relationshipGroup, work: relationshipGroup })
			.optional(),
		how_you_met: z.looseObject({ general_information: nstr }).optional(),
		food_preferences: nstr
	}),
	addresses: z.array(address).default([]),
	/** Counts Monica keeps per contact; used to skip requests for empty lists. */
	statistics: z.record(z.string(), z.number()).optional()
});
export type ContactDetail = z.infer<typeof contactDetail>;

export const note = z.looseObject({ id: z.number().int(), body: z.string(), is_favorited: z.boolean().optional(), created_at: z.string() });
export const activity = z.looseObject({
	id: z.number().int(),
	summary: nstr,
	description: nstr,
	happened_at: z.string(),
	activity_type: z.looseObject({ name: nstr }).nullable().optional()
});
export const call = z.looseObject({ id: z.number().int(), called_at: z.string(), content: nstr, contact_called: z.boolean().nullable().optional() });
export const conversation = z.looseObject({
	id: z.number().int(),
	happened_at: z.string(),
	messages: z.array(z.looseObject({ content: z.string(), written_by_me: z.boolean() })).default([]),
	contact_field_type: z.looseObject({ name: nstr }).nullable().optional()
});
export const task = z.looseObject({ id: z.number().int(), title: z.string(), description: nstr, completed: z.boolean(), created_at: z.string() });
export const gift = z.looseObject({
	id: z.number().int(),
	name: z.string(),
	comment: nstr,
	url: nstr,
	status: nstr, // idea | offered | received
	amount_with_currency: nstr,
	date: nstr
});
export const reminder = z.looseObject({
	id: z.number().int(),
	title: z.string(),
	description: nstr,
	frequency_type: nstr,
	frequency_number: z.number().nullable().optional(),
	initial_date: z.string()
});

// ---- Diary and logging (verified on staging 2026-11-21; activities and journal were empty)

/** GET /api/activitytypes */
export const activityType = z.looseObject({
	id: z.number().int(),
	name: z.string(),
	activity_type_category: z.looseObject({ name: z.string() }).nullable().optional()
});

/** GET /api/activities (list item): includes attendees. */
export const activityWithAttendees = activity.extend({
	attendees: z
		.looseObject({ total: z.number().int(), contacts: z.array(contactShort).default([]) })
		.optional()
});

/** GET /api/journal */
export const journalEntry = z.looseObject({
	id: z.number().int(),
	title: z.string().nullable(),
	post: z.string().nullable(),
	date: z.string().nullable().optional(),
	created_at: z.string()
});

/** GET /api/tasks (list item, across all contacts). */
export const taskWithContact = task.extend({ contact: contactShort.nullable().optional() });
