import { describe, expect, it } from 'vitest';
import { createMonicaClient, createTransport } from './client';
import { ContactNotFound, loadContactPage } from './contact-page';
import { fakeClock, fakeFetch, page } from './test-helpers';

const detail = {
	id: 7,
	object: 'contact',
	hash_id: 'h:abc',
	first_name: 'Ada',
	last_name: 'Lovelace',
	nickname: 'Countess',
	complete_name: 'Ada Lovelace',
	initials: 'AL',
	description: 'Mathematician',
	is_starred: false,
	is_partial: false,
	is_active: true,
	is_dead: false,
	tags: [{ id: 1, name: 'Friends' }],
	information: {
		avatar: { url: null, source: 'default', default_avatar_color: '#fdb660' },
		dates: { birthdate: { is_age_based: false, is_year_unknown: false, date: '1990-12-10T00:00:00Z' }, deceased_date: { date: null } },
		career: { job: 'Engineer', company: 'Analytical' },
		relationships: {
			love: { total: 0, contacts: [] },
			family: { total: 1, contacts: [{ relationship: { id: 1, name: 'sibling' }, contact: { id: 8, complete_name: 'Bea Lovelace', is_partial: false } }] },
			friend: { total: 0, contacts: null },
			work: { total: 0, contacts: [] }
		},
		how_you_met: { general_information: 'School' },
		food_preferences: null
	},
	addresses: [{ id: 1, name: 'Home', street: '1 Main St', city: 'Vancouver', province: 'BC', postal_code: 'V5K', country: { name: 'Canada' } }],
	contactFields: [
		{ id: 1, content: '+1 604 555 0101', contact_field_type: { id: 2, name: 'Phone', type: 'phone', protocol: 'tel:' } },
		{ id: 2, content: 'evil', contact_field_type: { id: 9, name: 'Custom', type: null, protocol: 'javascript:' } }
	],
	last_called: null,
	last_activity_together: null,
	created_at: '2026-11-19T00:00:00Z',
	updated_at: '2026-11-20T00:00:00Z'
};

const sub: Record<string, unknown[]> = {
	notes: [{ id: 1, body: 'Likes tea', created_at: '2026-10-01T09:00:00Z' }],
	activities: [{ id: 2, summary: 'Climbing', description: null, happened_at: '2026-11-01', activity_type: null }],
	calls: [{ id: 3, called_at: '2026-10-15T18:00:00Z', content: 'Caught up', contact_called: false }],
	conversations: [],
	tasks: [
		{ id: 4, title: 'Done thing', description: null, completed: true, created_at: 'x' },
		{ id: 5, title: 'Open thing', description: null, completed: false, created_at: 'x' }
	],
	gifts: [{ id: 6, name: 'Book', comment: null, url: 'javascript:alert(1)', status: 'idea', amount_with_currency: null, date: null }],
	reminders: [{ id: 7, title: 'Call', description: null, frequency_type: 'month', frequency_number: 2, initial_date: '2026-12-01T00:00:00Z' }]
};

function setup(over: Record<string, unknown> = {}, status = 200) {
	const f = fakeFetch((call) => {
		const path = new URL(call.url).pathname;
		if (path === '/api/contacts/7') return status === 200 ? { body: { data: { ...detail, ...over } } } : { status };
		const r = path.split('/').pop()!;
		return { body: page(sub[r] ?? [], 1, 1) };
	});
	const t = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: true, fetch: f.fetch, ...fakeClock() });
	return { ...f, client: createMonicaClient(t, { cacheTtlMs: 0 }) };
}

describe('loadContactPage', () => {
	it('loads everything with GET requests only', async () => {
		const { client, calls } = setup();
		const p = await loadContactPage(client, 7, new Date(2026, 10, 21));
		expect(calls.every((c) => c.method === 'GET')).toBe(true);
		expect(new URL(calls[0].url).searchParams.get('with')).toBe('contactfields');

		expect(p.name).toBe('Ada Lovelace');
		expect(p.birthday).toMatchObject({ daysUntil: 19, nextAge: 36, label: 'December 10, 1990' });
		expect(p.timeline.map((i) => i.kind)).toEqual(['activity', 'call', 'note']);
		expect(p.timeline[1].title).toBe('They called');
		expect(p.relationships).toEqual([{ type: 'sibling', contactId: 8, name: 'Bea Lovelace', partial: false }]);
		expect(p.tasks.map((t) => t.id)).toEqual([5, 4]);
		expect(p.reminders[0].frequency).toBe('every 2 months');
		expect(p.addresses[0]).toMatchObject({ label: 'Home', lines: ['1 Main St', 'V5K Vancouver', 'BC', 'Canada'] });
	});

	it('never produces unsafe links', async () => {
		const { client } = setup();
		const p = await loadContactPage(client, 7);
		expect(p.phones[0].href).toBe('tel:+16045550101');
		expect(p.otherFields[0].href).toBeNull();
		expect(p.gifts[0].href).toBeNull();
	});

	it('hides the birthday countdown for deceased contacts', async () => {
		const { client } = setup({ is_dead: true });
		expect((await loadContactPage(client, 7)).birthday).toBeNull();
	});

	it('404 and partial contacts are not found', async () => {
		await expect(loadContactPage(setup({}, 404).client, 7)).rejects.toBeInstanceOf(ContactNotFound);
		await expect(loadContactPage(setup({ is_partial: true }).client, 7)).rejects.toBeInstanceOf(ContactNotFound);
	});
});
