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
		})
	}),
	last_called: looseDate,
	last_activity_together: looseDate,
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
