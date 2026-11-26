// Owner decision 2026-11-26: a contact may be deleted only as the last step of a
// confirmed merge, and only when nothing is left on the copy.
import { describe, expect, it } from 'vitest';
import { recentAudit } from '../audit';
import { createTransport, type Method } from './client';
import { MERGE_DELETE_CAPABILITY } from './delete-capability';
import { ConflictError, WriteRefusedError } from './errors';
import { createGuards, DELETE_CAPABILITY, WRITE_ALLOWLIST } from './guards';
import { fakeClock, fakeFetch, memoryAudit, type Call } from './test-helpers';

const BASE = 'http://127.0.0.1:8081';
const emptyStats = { number_of_calls: 0, number_of_notes: 0, number_of_activities: 0, number_of_reminders: 0, number_of_tasks: 0, number_of_gifts: 0, number_of_debts: 0 };
const person = (id: number, extra: Record<string, unknown> = {}) => ({
	id,
	object: 'contact',
	complete_name: 'Kayla Preocanin',
	first_name: 'Kayla',
	last_name: 'Preocanin',
	nickname: null,
	is_partial: false,
	is_active: true,
	is_me: false,
	description: null,
	tags: [] as { name: string }[],
	contactFields: [] as unknown[],
	addresses: [],
	statistics: emptyStats,
	information: { avatar: { source: 'photo', url: 'x/p.jpg' }, dates: { birthdate: { date: null } }, relationships: {}, career: {}, how_you_met: {} },
	updated_at: `T${id}`,
	...extra
});
const empty = { data: [], meta: { last_page: 1 } };

function setup(o: { readOnly?: boolean; dryRun?: boolean; copy?: object; keep?: object; photos?: object[]; reminders?: object[]; pets?: object[] } = {}) {
	const copy = o.copy ?? person(43);
	const keep = o.keep ?? person(42, { tags: [{ name: 'Van' }] });
	const f = fakeFetch((c: Call) => {
		const p = new URL(c.url).pathname;
		if (c.method === 'DELETE') return { body: { deleted: true, id: 43 } };
		if (p === '/api/contacts/43') return { body: { data: copy } };
		if (p === '/api/contacts/42') return { body: { data: keep } };
		if (p.endsWith('/photos')) return { body: { data: o.photos ?? [{ id: 1, new_filename: 'p.jpg', dataUrl: 'data:image/jpeg;base64,AAAA' }], meta: { last_page: 1 } } };
		if (p.endsWith('/reminders')) return { body: { data: o.reminders ?? [], meta: { last_page: 1 } } };
		if (p.endsWith('/pets')) return { body: { data: o.pets ?? [] } };
		return { body: empty };
	});
	const transport = createTransport({ baseUrl: BASE, token: 't', readOnly: o.readOnly ?? false, fetch: f.fetch, ...fakeClock() });
	const { db, audit } = memoryAudit();
	const guards = createGuards({ transport, readOnly: o.readOnly ?? false, dryRun: o.dryRun ?? false, audit, allowlist: WRITE_ALLOWLIST });
	return { ...f, transport, guards, rows: () => recentAudit(db).reverse() };
}

describe('removeMergedDuplicate', () => {
	it('deletes the copy after reading everything; the audit row holds the copy (without photo data) and who it was merged into', async () => {
		const { guards, calls, rows } = setup();
		const r = await guards.removeMergedDuplicate(43, 42, 'T43', 'merged by test');
		expect(r.dryRun).toBe(false);
		expect(calls.at(-1)).toMatchObject({ method: 'DELETE', url: `${BASE}/api/contacts/43` });
		expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
		const row = rows().at(-1)!;
		expect(row).toMatchObject({ method: 'DELETE', endpoint: '/api/contacts/43', result: 'ok' });
		const before = JSON.parse(row.beforeJson!);
		expect(before.mergedInto).toMatchObject({ id: 42 });
		expect(before.contact.id).toBe(43);
		expect(JSON.stringify(before)).not.toContain('base64');
	});

	it('refuses when anything is left on the copy (tags, phones, notes, pets, other photos, reminders)', async () => {
		const cases = [
			{ copy: person(43, { tags: [{ name: 'Science' }] }) },
			{ copy: person(43, { contactFields: [{ content: '604 555 0101', contact_field_type: { id: 2, type: 'phone' } }] }) },
			{ copy: person(43, { statistics: { ...emptyStats, number_of_notes: 1 } }) },
			{ pets: [{ id: 1 }] },
			{ photos: [{ id: 1, new_filename: 'p.jpg', dataUrl: '' }, { id: 2, new_filename: 'q.jpg', dataUrl: '' }] },
			{ reminders: [{ id: 5, delible: true }] },
			{ copy: person(43, { is_me: true }) }
		];
		for (const c of cases) {
			const { guards, calls, rows } = setup(c);
			await expect(guards.removeMergedDuplicate(43, 42, 'T43', 'x')).rejects.toMatchObject({ reason: 'precondition' });
			expect(calls.some((x) => x.method === 'DELETE')).toBe(false);
			expect(rows().at(-1)!.result).toBe('refused:precondition');
		}
	});

	it('a phone already on the person kept (other format) is not a leftover', async () => {
		const field = (content: string) => ({ content, contact_field_type: { id: 2, type: 'phone' } });
		const { guards, calls } = setup({ copy: person(43, { contactFields: [field('604 555 0101')] }), keep: person(42, { contactFields: [field('+1 (604) 555-0101')] }) });
		await guards.removeMergedDuplicate(43, 42, 'T43', 'x');
		expect(calls.at(-1)!.method).toBe('DELETE');
	});

	it('conflict, read-only, dry run and bad ids send no DELETE', async () => {
		const c = setup();
		await expect(c.guards.removeMergedDuplicate(43, 42, 'old', 'x')).rejects.toBeInstanceOf(ConflictError);
		expect(c.calls.some((x) => x.method === 'DELETE')).toBe(false);
		const ro = setup({ readOnly: true });
		await expect(ro.guards.removeMergedDuplicate(43, 42, 'T43', 'x')).rejects.toMatchObject({ reason: 'read-only' });
		expect(ro.calls).toHaveLength(0);
		const dry = setup({ dryRun: true });
		expect((await dry.guards.removeMergedDuplicate(43, 42, 'T43', 'x')).dryRun).toBe(true);
		expect(dry.calls.some((x) => x.method === 'DELETE')).toBe(false);
		const same = setup();
		await expect(same.guards.removeMergedDuplicate(42, 42, 'T42', 'x')).rejects.toBeInstanceOf(WriteRefusedError);
		expect(same.calls).toHaveLength(0);
	});

	it('the merge token deletes only contacts; the plain token never deletes contacts; generic remove cannot either', async () => {
		const { transport, guards, calls } = setup();
		for (const path of ['/api/notes/1', '/api/activities/1', '/api/contacts/1/photos', '/api/contactfields/3', '/api/contacts']) {
			await expect(transport.request('DELETE' as Method, path, { deleteCapability: MERGE_DELETE_CAPABILITY })).rejects.toMatchObject({ reason: 'delete-forbidden' });
		}
		await expect(transport.request('DELETE' as Method, '/api/contacts/43', { deleteCapability: DELETE_CAPABILITY })).rejects.toMatchObject({ reason: 'delete-forbidden' });
		await expect(guards.remove('contact.delete', 43, 'T43')).rejects.toMatchObject({ reason: 'not-allowlisted' });
		expect(calls).toHaveLength(0);
		expect(WRITE_ALLOWLIST.some((r) => r.method === 'DELETE' && r.path.includes('contacts'))).toBe(false);
	});
});
