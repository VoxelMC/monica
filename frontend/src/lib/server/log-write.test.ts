import { describe, expect, it } from 'vitest';
import { recentAudit } from './audit';
import { saveHangout } from './log-write';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const known = { contactIds: new Set([1, 3, 5]), activityTypeIds: new Set([9]) };
const draft = {
	contactIds: [1, 3],
	summary: 'Dinner at Ana’s',
	description: '',
	date: '2026-11-20',
	activityTypeId: 9,
	personNotes: { '1': 'Starting a new job in March', '3': '  ', '5': 'not there' }
};

function setup(opts: { readOnly?: boolean; dryRun?: boolean; replies?: Parameters<typeof fakeFetch>[0] } = {}) {
	const f = fakeFetch(opts.replies ?? ((c) => ({ body: { data: { id: c.url.endsWith('/activities') ? 77 : 500 } } })));
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: opts.readOnly ?? false, fetch: f.fetch, ...fakeClock() });
	const { db, audit } = memoryAudit();
	const guards = createGuards({ transport, readOnly: opts.readOnly ?? false, dryRun: opts.dryRun ?? false, audit, allowlist: WRITE_ALLOWLIST });
	return { ...f, guards, rows: () => recentAudit(db).reverse() };
}

describe('saveHangout', () => {
	it('creates the activity, then one note per person with text who was there', async () => {
		const { guards, calls, rows } = setup();
		const r = await saveHangout(guards, draft, known, '2026-11-21');
		expect(r).toMatchObject({ ok: true, activityId: 77, dryRun: false, notes: [{ contactId: 1, saved: true }] });
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['POST /api/activities', 'POST /api/notes']);
		expect(calls[0].body).toEqual({ summary: 'Dinner at Ana’s', happened_at: '2026-11-20', activity_type_id: 9, contacts: [1, 3] });
		expect(calls[1].body).toEqual({ contact_id: 1, body: 'From: Dinner at Ana’s · 2026-11-20\n\nStarting a new job in March' });
		expect(rows().map((x) => `${x.endpoint} ${x.result}`)).toEqual(['/api/activities ok', '/api/notes ok']);
	});

	it('read-only: nothing is sent and the message says so', async () => {
		const { guards, calls } = setup({ readOnly: true });
		const r = await saveHangout(guards, draft, known, '2026-11-21');
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/read-only.*Nothing was saved/);
		expect(calls).toHaveLength(0);
	});

	it('dry run: nothing is sent, everything is audited', async () => {
		const { guards, calls, rows } = setup({ dryRun: true });
		const r = await saveHangout(guards, draft, known, '2026-11-21');
		expect(r).toMatchObject({ ok: true, dryRun: true });
		expect(calls).toHaveLength(0);
		expect(rows().map((x) => x.result)).toEqual(['dry-run', 'dry-run']);
	});

	it('stops at the first failed note and reports what was saved (no retries)', async () => {
		const draft2 = { ...draft, personNotes: { '1': 'one', '3': 'two' } };
		const { guards, calls } = setup({ replies: [{ body: { data: { id: 77 } } }, { status: 500 }, { body: {} }] });
		const r = await saveHangout(guards, draft2, known, '2026-11-21');
		expect(r).toMatchObject({ ok: false, activityId: 77, notes: [{ contactId: 1, saved: false }] });
		expect(r.message).toMatch(/hangout and 0 notes were saved/);
		expect(calls).toHaveLength(2); // the second note was never attempted
	});

	it('a failed activity means nothing else is attempted', async () => {
		const { guards, calls } = setup({ replies: [{ status: 422, body: {} }] });
		const r = await saveHangout(guards, draft, known, '2026-11-21');
		expect(r).toMatchObject({ ok: false, activityId: null, notes: [] });
		expect(r.message).toMatch(/Nothing was saved/);
		expect(calls).toHaveLength(1);
	});

	it('re-validates on the server: bad input, unknown people or types, future dates', async () => {
		const { guards, calls } = setup();
		expect((await saveHangout(guards, { nope: true }, known)).ok).toBe(false);
		expect((await saveHangout(guards, { ...draft, contactIds: [1, 42] }, known, '2026-11-21')).message).toMatch(/not in Monica/);
		expect((await saveHangout(guards, { ...draft, activityTypeId: 1234 }, known, '2026-11-21')).message).toMatch(/activity type/);
		expect((await saveHangout(guards, { ...draft, date: '2026-11-22' }, known, '2026-11-21')).message).toMatch(/future/);
		expect((await saveHangout(guards, { ...draft, summary: ' ' }, known, '2026-11-21')).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
});
