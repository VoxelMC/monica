import { describe, expect, it } from 'vitest';
import { createMonicaClient, createTransport } from './client';
import { getAvatar, listContacts, toCard } from './contacts';
import { contactListItem } from './schemas';
import { fakeClock, fakeFetch, page } from './test-helpers';

const raw = (id: number, o: Record<string, unknown> = {}) => ({
	id,
	object: 'contact',
	first_name: 'F' + id,
	last_name: 'L',
	nickname: null,
	complete_name: `F${id} L`,
	initials: 'FL',
	is_starred: false,
	is_partial: false,
	is_active: true,
	tags: [{ id: 1, name: 'Friends', name_slug: 'friends' }],
	information: { avatar: { url: `http://127.0.0.1:8081/store/avatars/x${id}.jpg?1`, source: 'default', default_avatar_color: '#fdb660' } },
	last_called: null,
	last_activity_together: null,
	created_at: '2026-11-19T15:16:49Z',
	updated_at: '2026-11-19T15:16:49Z',
	contactFields: [
		{ id: 10, content: '+1 604 555 0101', contact_field_type: { id: 2, name: 'Phone', type: 'phone', protocol: 'tel:' } },
		{ id: 11, content: 'a@example.test', contact_field_type: { id: 1, name: 'Email', type: 'email', protocol: 'mailto:' } },
		{ id: 12, content: 'me#1234', contact_field_type: { id: 9, name: 'Discord', type: null, protocol: null } }
	],
	...o
});

function client(replies: Parameters<typeof fakeFetch>[0]) {
	const f = fakeFetch(replies);
	const t = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: true, fetch: f.fetch, ...fakeClock() });
	return { ...f, client: createMonicaClient(t, { cacheTtlMs: 0 }) };
}

describe('toCard', () => {
	it('maps phones, emails, tags and avatar colour; ignores custom field types', () => {
		const c = toCard(contactListItem.parse(raw(1)));
		expect(c).toMatchObject({ id: 1, name: 'F1 L', color: '#fdb660', hasPhoto: false, tags: ['Friends'], phones: ['+1 604 555 0101'], emails: ['a@example.test'] });
	});
	it('lastContacted is the later of activity and call', () => {
		const c = toCard(contactListItem.parse(raw(1, { last_called: '2026-10-01', last_activity_together: '2026-09-01T10:00:00Z' })));
		expect(c.lastContacted).toBe('2026-10-01');
		const d = toCard(contactListItem.parse(raw(1, { last_activity_together: { date: '2026-11-02 00:00:00.000000' } })));
		expect(d.lastContacted).toBe('2026-11-02 00:00:00.000000');
	});
});

describe('listContacts', () => {
	it('requests contactfields, walks all pages, hides partial and archived contacts', async () => {
		const { client: c, calls } = client([
			{ body: page([raw(1), raw(2, { is_partial: true })], 1, 2) },
			{ body: page([raw(3, { is_active: false }), raw(4)], 2, 2) }
		]);
		const list = await listContacts(c);
		expect(list.map((x) => x.id)).toEqual([1, 4]);
		expect(calls.every((x) => new URL(x.url).searchParams.get('with') === 'contactfields')).toBe(true);
		expect(calls.every((x) => x.method === 'GET')).toBe(true);
	});
});

describe('getAvatar', () => {
	const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
	const withPhoto = raw(5, { information: { avatar: { url: 'http://127.0.0.1:8081/store/photos/abc.jpg', source: 'photo', default_avatar_color: '#000' } } });

	it('returns the photo matching the avatar URL', async () => {
		const { client: c } = client((call) =>
			call.url.includes('/photos')
				? { body: page([{ id: 1, new_filename: 'photos/other.jpg', mime_type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }, { id: 2, new_filename: 'photos/abc.jpg', mime_type: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${jpeg}` }], 1, 1) }
				: { body: page([withPhoto], 1, 1) }
		);
		const a = await getAvatar(c, 5);
		expect(a?.mime).toBe('image/jpeg');
		expect([...a!.bytes]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
	});

	it('returns null for default avatars and non-image data', async () => {
		const { client: c } = client((call) =>
			call.url.includes('/photos') ? { body: page([{ id: 1, new_filename: 'abc.jpg', mime_type: 'text/html', dataUrl: 'data:text/html;base64,PGh0bWw+' }], 1, 1) } : { body: page([raw(6), withPhoto], 1, 1) }
		);
		expect(await getAvatar(c, 6)).toBeNull();
		expect(await getAvatar(c, 5)).toBeNull();
	});
});
