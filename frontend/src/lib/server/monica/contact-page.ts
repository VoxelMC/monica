// Contact page data (read-only, slice 2). Verified on staging 2026-11-21:
// GET /api/contacts/{id}?with=contactfields includes addresses and contact fields;
// notes, activities, calls, conversations, tasks, gifts and reminders come from
// /api/contacts/{id}/<resource>, all paginated.
import { birthdayInfo, daysFromToday, fieldHref, mapHref, nextOccurrence, parseBirthday, safeHttpUrl, sortTimeline, type BirthdayInfo, type ContactFieldView, type ReminderView, type TimelineItem } from '../../contact';
import { displayName, photoKey } from '../../contacts';
import type { MonicaClient } from './client';
import { MonicaHttpError } from './errors';
import { activity, call, contactDetail, conversation, gift, note, reminder, single, task } from './schemas';

export interface ContactPage {
	id: number;
	hashId: string;
	name: string;
	nickname: string | null;
	initials: string;
	color: string;
	hasPhoto: boolean;
	photoKey: string | null;
	description: string | null;
	job: string | null;
	company: string | null;
	isDead: boolean;
	birthday: BirthdayInfo | null;
	/** The stored date, for correcting it (null if none or deceased). */
	birthdayDate: { month: number; day: number; year: number | null } | null;
	tags: string[];
	phones: ContactFieldView[];
	emails: ContactFieldView[];
	otherFields: ContactFieldView[];
	addresses: { label: string; lines: string[]; href: string | null }[];
	timeline: TimelineItem[];
	relationships: { type: string; contactId: number; name: string; partial: boolean }[];
	tasks: { id: number; title: string; description: string | null; completed: boolean }[];
	gifts: { id: number; name: string; status: string | null; comment: string | null; amount: string | null; href: string | null }[];
	/** Soonest first; past one-time reminders last. */
	reminders: ReminderView[];
	howYouMet: string | null;
	foodPreferences: string | null;
	updatedAt: string;
}

export class ContactNotFound extends Error {}

function frequency(type: string | null | undefined, n: number | null | undefined): string {
	if (!type || type === 'one_time') return 'once';
	const unit = type.replace(/ly$/, '').replace(/^dai$/, 'day'); // weekly -> week, monthly -> month, yearly -> year
	return !n || n === 1 ? `every ${unit}` : `every ${n} ${unit}s`;
}

export async function loadContactPage(client: MonicaClient, id: number, today = new Date()): Promise<ContactPage> {
	let detail;
	try {
		detail = (await client.get(`/api/contacts/${id}`, single(contactDetail), { with: 'contactfields' })).data;
	} catch (err) {
		if (err instanceof MonicaHttpError && err.status === 404) throw new ContactNotFound(`Contact ${id} not found`);
		throw err;
	}
	if (detail.is_partial) throw new ContactNotFound(`Contact ${id} is partial`);

	const base = `/api/contacts/${id}`;
	// Monica's per-contact counts let us skip lists that are empty (most of them on a
	// typical contact), which keeps orbit well inside Monica's per-minute API limit.
	// Conversations have no count, so they are always fetched.
	const stats = detail.statistics;
	const has = (key: string) => !stats || stats[key] === undefined || stats[key] > 0;
	const list = <T extends import('zod').ZodType>(key: string | null, path: string, schema: T) =>
		key === null || has(key) ? client.getAll(`${base}/${path}`, schema) : Promise.resolve([] as import('zod').infer<T>[]);
	const [notes, activities, calls, conversations, tasks, gifts, reminders] = await Promise.all([
		list('number_of_notes', 'notes', note),
		list('number_of_activities', 'activities', activity),
		list('number_of_calls', 'calls', call),
		list(null, 'conversations', conversation),
		list('number_of_tasks', 'tasks', task),
		list('number_of_gifts', 'gifts', gift),
		list('number_of_reminders', 'reminders', reminder)
	]);

	const fields = detail.contactFields ?? [];
	const view = (f: (typeof fields)[number]): ContactFieldView => ({
		label: f.contact_field_type.name,
		value: f.content,
		href: fieldHref(f.contact_field_type.type, f.contact_field_type.protocol, f.content)
	});

	const timeline: TimelineItem[] = [
		...notes.map((n) => ({ kind: 'note' as const, id: n.id, date: n.created_at, title: 'Note', body: n.body, updatedAt: n.updated_at })),
		...activities.map((a) => ({
			kind: 'activity' as const,
			id: a.id,
			date: a.happened_at,
			title: a.summary || a.activity_type?.name || 'Activity',
			body: a.description ?? null,
			updatedAt: a.updated_at
		})),
		...calls.map((c) => ({
			kind: 'call' as const,
			id: c.id,
			date: c.called_at,
			title: c.contact_called === false ? 'They called' : 'Call',
			body: c.content ?? null
		})),
		...conversations.map((c) => ({
			kind: 'conversation' as const,
			id: c.id,
			date: c.happened_at,
			title: `Conversation${c.contact_field_type?.name ? ` (${c.contact_field_type.name})` : ''}`,
			body: c.messages.map((m) => `${m.written_by_me ? 'Me' : 'Them'}: ${m.content}`).join('\n') || null
		}))
	];

	const rel = detail.information.relationships;
	const relationships = (['love', 'family', 'friend', 'work'] as const).flatMap((g) =>
		(rel?.[g]?.contacts ?? []).map((r) => ({
			type: r.relationship.name,
			contactId: r.contact.id,
			name: displayName(r.contact.first_name ?? null, r.contact.last_name ?? null, r.contact.complete_name),
			partial: !!r.contact.is_partial
		}))
	);

	const b = parseBirthday(detail.information.dates.birthdate);

	return {
		id: detail.id,
		hashId: detail.hash_id,
		name: displayName(detail.first_name, detail.last_name, detail.complete_name),
		nickname: detail.nickname,
		initials: detail.initials,
		color: detail.information.avatar.default_avatar_color ?? '#64748b',
		hasPhoto: detail.information.avatar.source === 'photo',
		photoKey: photoKey(detail.information.avatar),
		description: detail.description ?? null,
		job: detail.information.career?.job ?? null,
		company: detail.information.career?.company ?? null,
		isDead: detail.is_dead,
		birthday: b && !detail.is_dead ? birthdayInfo(b, today) : null,
		birthdayDate: b && !detail.is_dead ? { month: b.month, day: b.day, year: b.ageIsApprox ? null : b.year } : null,
		tags: detail.tags.map((t) => t.name),
		phones: fields.filter((f) => f.contact_field_type.type === 'phone').map(view),
		emails: fields.filter((f) => f.contact_field_type.type === 'email').map(view),
		otherFields: fields.filter((f) => f.contact_field_type.type !== 'phone' && f.contact_field_type.type !== 'email').map(view),
		addresses: detail.addresses.map((a) => {
			const lines = [a.street, [a.postal_code, a.city].filter(Boolean).join(' '), a.province, a.country?.name].filter((l): l is string => !!l && !!l.trim());
			return { label: a.name || 'Address', lines, href: mapHref(lines) };
		}),
		timeline: sortTimeline(timeline),
		relationships,
		tasks: tasks
			.map((t) => ({ id: t.id, title: t.title, description: t.description ?? null, completed: t.completed }))
			.sort((a, b) => Number(a.completed) - Number(b.completed)),
		gifts: gifts.map((g) => ({
			id: g.id,
			name: g.name,
			status: g.status ?? null,
			comment: g.comment ?? null,
			amount: g.amount_with_currency ?? null,
			href: safeHttpUrl(g.url)
		})),
		reminders: reminders
			.map((r) => {
				const next = nextOccurrence(r.initial_date, r.frequency_type, r.frequency_number, today);
				return { id: r.id, title: r.title, next, daysUntil: next ? daysFromToday(next, today) : null, frequency: frequency(r.frequency_type, r.frequency_number) };
			})
			.sort((a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity)),
		howYouMet: detail.information.how_you_met?.general_information ?? null,
		foodPreferences: detail.information.food_preferences ?? null,
		updatedAt: detail.updated_at
	};
}
