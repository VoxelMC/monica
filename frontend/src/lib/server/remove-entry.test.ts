import { describe, expect, it } from 'vitest';
import { recentAudit } from './audit';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';
import { removeEntry } from './remove-entry';

const ACT = { data: { id: 1, object: 'activity', summary: 'Dinner', updated_at: '2026-11-22T21:57:57Z' } };
function setup(readOnly = false, replies: Parameters<typeof fakeFetch>[0] = [{ body: ACT }, { body: { deleted: true, id: 1 } }]) {
	const f = fakeFetch(replies);
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	const { db, audit } = memoryAudit();
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit, allowlist: WRITE_ALLOWLIST }), rows: () => recentAudit(db) };
}
const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const good = { kind: 'activity', id: '1', updatedAt: ACT.data.updated_at, confirm: 'yes' };

describe('removeEntry', () => {
	it('removes after confirmation, with a copy in the audit log', async () => {
		const { guards, calls, rows } = setup();
		const r = await removeEntry(guards, form(good));
		expect(r).toMatchObject({ ok: true, dryRun: false });
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/activities/1', 'DELETE /api/activities/1']);
		expect(JSON.parse(rows()[0].beforeJson!)).toEqual(ACT.data);
	});
	it('without the confirmation tick, nothing happens', async () => {
		const { guards, calls } = setup();
		const r = await removeEntry(guards, form({ ...good, confirm: '' }));
		expect(r.ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('only hangouts, notes and journal entries: anything else is refused without a request', async () => {
		const { guards, calls } = setup();
		for (const kind of ['contact', 'tag', 'reminder', '']) expect((await removeEntry(guards, form({ ...good, kind }))).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('explains conflicts, read-only and already-gone', async () => {
		expect((await removeEntry(setup().guards, form({ ...good, updatedAt: '2020-01-01T00:00:00Z' }))).message).toMatch(/changed in Monica/);
		expect((await removeEntry(setup(true).guards, form(good))).message).toMatch(/read-only/);
		expect((await removeEntry(setup(false, [{ status: 404 }]).guards, form(good))).message).toMatch(/already gone/);
	});
});
