import { describe, expect, it } from 'vitest';
import { saveBirthdays } from './birthday-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const contact = (id: number, birthdate: string | null = null) => ({
	data: { id, object: 'contact', first_name: 'P' + id, description: null, is_dead: false, information: { dates: { birthdate: { date: birthdate }, deceased_date: { date: null } } }, updated_at: 'u' + id }
});
function setup(replies: Parameters<typeof fakeFetch>[0], readOnly = false) {
	const f = fakeFetch(replies);
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
}
const names = new Map([[1, 'Ana'], [2, 'Bob']]);
const today = new Date(2026, 10, 23);

describe('saveBirthdays', () => {
	it('saves each person with a fresh read, in order', async () => {
		const { guards, calls } = setup((c) => (c.method === 'GET' ? { body: contact(Number(new URL(c.url).pathname.split('/').pop())) } : { body: {} }));
		const r = await saveBirthdays(guards, { entries: [{ id: 1, month: 3, day: 11, year: 2001, updatedAt: 'u1' }, { id: 2, month: 7, day: 14, year: null, updatedAt: 'u2' }] }, names, today);
		expect(r).toMatchObject({ ok: true, saved: [1, 2] });
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/contacts/1', 'PUT /api/contacts/1', 'GET /api/contacts/2', 'PUT /api/contacts/2']);
		expect(calls[3].body).toMatchObject({ birthdate_month: 7, birthdate_day: 14, birthdate_year: null, first_name: 'P2' });
	});
	it('stops at someone who already has a birthday, without overwriting it', async () => {
		const { guards, calls } = setup([{ body: contact(1, '1990-01-01T00:00:00Z') }]);
		const r = await saveBirthdays(guards, { entries: [{ id: 1, month: 3, day: 11, year: null, updatedAt: 'u1' }, { id: 2, month: 7, day: 14, year: null, updatedAt: 'u2' }] }, names, today);
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/Ana: they already have a birthday.*Nothing was saved/);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
	});
	it('validates everything before sending anything', async () => {
		const { guards, calls } = setup([]);
		expect((await saveBirthdays(guards, { entries: [{ id: 1, month: 2, day: 30, year: null, updatedAt: 'u' }] }, names, today)).message).toMatch(/Ana: That day does not exist/);
		expect((await saveBirthdays(guards, { entries: [{ id: 9, month: 1, day: 1, year: null, updatedAt: 'u' }] }, names, today)).message).toMatch(/not in Monica/);
		expect((await saveBirthdays(guards, { entries: [{ id: 1, month: 1, day: 1, year: null, updatedAt: 'u' }, { id: 1, month: 1, day: 2, year: null, updatedAt: 'u' }] }, names, today)).message).toMatch(/twice/);
		expect((await saveBirthdays(guards, { nope: 1 }, names, today)).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('read-only: nothing is sent', async () => {
		const { guards, calls } = setup([], true);
		const r = await saveBirthdays(guards, { entries: [{ id: 1, month: 3, day: 11, year: null, updatedAt: 'u1' }] }, names, today);
		expect(r.message).toMatch(/read-only/);
		expect(calls).toHaveLength(0);
	});
});
