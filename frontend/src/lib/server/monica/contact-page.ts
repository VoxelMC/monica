// Contact page data (read-only, slice 2). Verified on staging 2026-11-21:
// GET /api/contacts/{id}?with=contactfields includes addresses and contact fields;
// notes, activities, calls, conversations, tasks, gifts and reminders come from
// /api/contacts/{id}/<resource>, all paginated.
import { birthdayInfo, fieldHref, mapHref, parseBirthday, safeHttpUrl, sortTimeline, type BirthdayInfo, type ContactFieldView, type TimelineItem } from '../../contact';
import { displayName } from '../../contacts';
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
	description: string | null;
	job: string | null;
	company: string | null;
	isDead: boolean;
	birthday: BirthdayInfo | null;
	tags: string[];
	phones: ContactFieldView[];
	emails: ContactFieldView[];
	otherFields: ContactFieldView[];
	addresses: { label: string; lines: string[]; href: string | null }[];
	timeline: TimelineItem[];
	relationships: { type: string; contactId: number; name: string; partial: boolean }[];
	tasks: { id: number; title: string; description: string | null; completed: boolean }[];
	gifts: { id: number; name: string; status: string | null; comment: string | null; amount: string | null; href: string | null }[];
	reminders: { id: number; title: string; date: string; frequency: string }[];
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
	const [notes, activities, calls, conversations, tasks, gifts, reminders] = await Promise.all([
		client.getAll(`${base}/notes`, note),
		client.getAll(`${base}/activities`, activity),
		client.getAll(`${base}/calls`, call),
		client.getAll(`${base}/conversations`, conversation),
		client.getAll(`${base}/tasks`, task),
		client.getAll(`${base}/gifts`, gift),
		client.getAll(`${base}/reminders`, reminder)
	]);

	const fields = detail.contactFields ?? [];
	const view = (f: (typeof fields)[number]): ContactFieldView => ({
		label: f.contact_field_type.name,
		value: f.content,
		href: fieldHref(f.contact_field_type.type, f.contact_field_type.protocol, f.content)
	});

	const timeline: TimelineItem[] = [
		...notes.map((n) => ({ kind: 'note' as const, id: n.id, date: n.created_at, title: 'Note', body: n.body })),
		...activities.map((a) => ({
			kind: 'activity' as const,
			id: a.id,
			date: a.happened_at,
			title: a.summary || a.activity_type?.name || 'Activity',
			body: a.description ?? null
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
			name: r.contact.complete_name,
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
		description: detail.description ?? null,
		job: detail.information.career?.job ?? null,
		company: detail.information.career?.company ?? null,
		isDead: detail.is_dead,
		birthday: b && !detail.is_dead ? birthdayInfo(b, today) : null,
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
		reminders: reminders.map((r) => ({ id: r.id, title: r.title, date: r.initial_date, frequency: frequency(r.frequency_type, r.frequency_number) })),
		howYouMet: detail.information.how_you_met?.general_information ?? null,
		foodPreferences: detail.information.food_preferences ?? null,
		updatedAt: detail.updated_at
	};
}
