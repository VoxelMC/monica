// Contacts (read-only). Verified on staging 2026-11-21:
//  - GET /api/contacts?with=contactfields includes phones/emails as `contactFields`
//  - Monica's ?query= search does not match phones or emails, so orbit searches itself
//  - ?sort= only supports created_at / updated_at; other sorts happen in orbit
//  - Photo files under /store need a web session; GET /api/contacts/{id}/photos
//    returns them as base64 `dataUrl`
import { parseBirthday } from '../../contact';
import { displayName, photoKey, type ContactCard } from '../../contacts';
import type { MonicaClient } from './client';
import { contactListItem, photo, tag, taskWithContact, type ContactListItem } from './schemas';

const latest = (...dates: (string | null | undefined)[]) =>
	dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

export function toCard(c: ContactListItem): ContactCard {
	const fields = c.contactFields ?? [];
	return {
		id: c.id,
		name: displayName(c.first_name, c.last_name, c.complete_name),
		firstName: c.first_name,
		lastName: c.last_name,
		nickname: c.nickname,
		initials: c.initials,
		color: c.information.avatar.default_avatar_color ?? '#64748b',
		hasPhoto: c.information.avatar.source === 'photo',
		photoKey: photoKey(c.information.avatar),
		starred: c.is_starred,
		tags: c.tags.map((t) => t.name),
		lastContacted: latest(c.last_activity_together, c.last_called),
		createdAt: c.created_at,
		phones: fields.filter((f) => f.contact_field_type.type === 'phone').map((f) => f.content),
		emails: fields.filter((f) => f.contact_field_type.type === 'email').map((f) => f.content),
		birthday: c.is_dead ? null : parseBirthday(c.information.dates?.birthdate),
		stayInTouchDays: c.stay_in_touch_frequency ?? null,
		updatedAt: c.updated_at
	};
}

/** All active, non-partial contacts (as in Monica's own list), with phones and emails. */
export async function listContacts(client: MonicaClient): Promise<ContactCard[]> {
	const all = await client.getAll('/api/contacts', contactListItem, { with: 'contactfields' });
	return all.filter((c) => !c.is_partial && c.is_active).map(toCard);
}

/** The contact's avatar photo as bytes, or null if it has none. */
export async function getAvatar(
	client: MonicaClient,
	contactId: number
): Promise<{ mime: string; bytes: Uint8Array } | null> {
	const [list, photos] = await Promise.all([
		client.getAll('/api/contacts', contactListItem, { with: 'contactfields' }),
		client.getAll(`/api/contacts/${contactId}/photos`, photo)
	]);
	const c = list.find((x) => x.id === contactId);
	if (!c || c.information.avatar.source !== 'photo') return null;
	// The avatar URL ends with the photo's file name; fall back to the first photo.
	const file = (c.information.avatar.url ?? '').split('?')[0].split('/').pop();
	const p = photos.find((x) => x.new_filename.endsWith(file ?? '\0')) ?? photos[0];
	if (!p) return null;
	const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(p.dataUrl);
	if (!m || !m[1].startsWith('image/')) return null;
	return { mime: m[1], bytes: Uint8Array.from(Buffer.from(m[2], 'base64')) };
}

/** All tag names in Monica, including tags no contact uses (GET /api/tags). */
export async function listTagNames(client: MonicaClient): Promise<string[]> {
	const tags = await client.getAll('/api/tags', tag);
	return tags.map((t) => t.name);
}

/** Open tasks across all contacts (GET /api/tasks). */
export async function listOpenTasks(client: MonicaClient) {
	const tasks = await client.getAll('/api/tasks', taskWithContact);
	return tasks
		.filter((t) => !t.completed)
		.map((t) => ({
			id: t.id,
			title: t.title,
			description: t.description ?? null,
			createdAt: t.created_at,
			contact: t.contact && !t.contact.is_partial ? { id: t.contact.id, name: displayName(t.contact.first_name ?? null, t.contact.last_name ?? null, t.contact.complete_name) } : null
		}))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Tags with their ids (GET /api/tags), for removing a tag by id. */
export async function listTags(client: MonicaClient): Promise<{ id: number; name: string; updatedAt: string | null }[]> {
	const tags = await client.getAll('/api/tags', tag);
	return tags.map((t) => ({ id: t.id, name: t.name, updatedAt: typeof t.updated_at === 'string' ? t.updated_at : null }));
}
