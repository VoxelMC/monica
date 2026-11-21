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
