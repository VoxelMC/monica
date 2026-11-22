import { describe, expect, it } from 'vitest';
import { recentAudit } from '../audit';
import { createTransport, type Method } from './client';
import { ConflictError, WriteRefusedError } from './errors';
import { checkWrite, createGuards, DELETE_CAPABILITY, WRITE_ALLOWLIST, type WriteRule } from './guards';
import { fakeClock, fakeFetch, memoryAudit } from './test-helpers';

const BASE = 'http://127.0.0.1:8081';

// Test-only rules (generic fixtures). The real allowlist is tested further down.
const RULES: WriteRule[] = [
	{ key: 'note.create', method: 'POST', path: '/api/notes', editableFields: ['body', 'contact_id', 'is_favorited'] },
	{
		key: 'thing.update',
		method: 'PUT',
		path: '/api/things/{id}',
		editableFields: ['nickname'],
		toPayload: (c) => ({
			first_name: c.first_name,
			last_name: c.last_name,
			nickname: c.nickname,
			gender_id: (c.gender as { id: number }).id,
			description: c.description
		})
	}
];

const CURRENT = {
	data: {
		id: 42,
		first_name: 'Ada',
		last_name: 'Lovelace',
		nickname: 'Countess',
		gender: { id: 2, name: 'Woman' },
		description: 'Keep me',
		updated_at: '2026-11-20T10:00:00Z'
	}
};

function setup(opts: { readOnly: boolean; dryRun?: boolean; allowlist?: WriteRule[]; replies?: Parameters<typeof fakeFetch>[0] }) {
	const f = fakeFetch(opts.replies ?? [{ body: CURRENT }, { body: { data: { ok: true } } }]);
	const clock = fakeClock();
	const transport = createTransport({ baseUrl: BASE, token: 't', readOnly: opts.readOnly, fetch: f.fetch, ...clock });
	const { db, audit } = memoryAudit();
	let invalidated = 0;
	const guards = createGuards({
		transport,
		readOnly: opts.readOnly,
		dryRun: opts.dryRun ?? false,
		audit,
		allowlist: opts.allowlist ?? RULES,
		onWrite: () => invalidated++
	});
	return { ...f, transport, guards, db, rows: () => recentAudit(db).reverse(), invalidated: () => invalidated };
}

describe('read-only switch (slice 0 done-when)', () => {
	it('the transport refuses every non-GET method while read-only, and sends nothing', async () => {
		const { transport, calls } = setup({ readOnly: true });
		for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'OPTIONS', 'HEAD']) {
			await expect(transport.request(m as Method, '/api/contacts/1', { body: {} })).rejects.toBeInstanceOf(WriteRefusedError);
		}
		expect(calls).toHaveLength(0);
	});

	it('guards refuse create and update while read-only, even for allowlisted rules, and log the refusal', async () => {
		const { guards, calls, rows } = setup({ readOnly: true });
		await expect(guards.create('note.create', { body: 'hi', contact_id: 1 })).rejects.toMatchObject({ reason: 'read-only' });
		await expect(guards.update('thing.update', 42, { nickname: 'x' }, 'any')).rejects.toMatchObject({ reason: 'read-only' });
		await expect(guards.create('unknown.rule', {})).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0); // not even the fetch-merge GET
		expect(rows().map((r) => r.result)).toEqual(['refused:read-only', 'refused:read-only', 'refused:read-only']);
	});

	it('read-only wins over dry run', async () => {
		const { guards, calls } = setup({ readOnly: true, dryRun: true });
		await expect(guards.create('note.create', { body: 'hi' })).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
	});

	it('checkWrite refuses every write method while read-only', () => {
		for (const m of ['POST', 'PUT', 'PATCH']) {
			expect(() => checkWrite(m, '/api/notes', { readOnly: true, allowlist: RULES })).toThrow(WriteRefusedError);
		}
	});
});

describe('DELETE (owner decision 2026-11-23: hangouts, notes, journal entries only)', () => {
	it('the transport refuses any DELETE that does not come from the guards', async () => {
		const { transport, calls } = setup({ readOnly: false });
		await expect(transport.request('DELETE' as Method, '/api/notes/1')).rejects.toMatchObject({ reason: 'delete-forbidden' });
		expect(calls).toHaveLength(0);
	});

	it('even with the guards\' capability, the transport refuses contacts and any other path', async () => {
		const { transport, calls } = setup({ readOnly: false });
		for (const path of ['/api/contacts/1', '/api/contactfields/3', '/api/tags/2', '/api/notes', '/api/notes/1/extra', '/api/reminders/4']) {
			await expect(transport.request('DELETE' as Method, path, { deleteCapability: DELETE_CAPABILITY })).rejects.toMatchObject({ reason: 'delete-forbidden' });
		}
		expect(calls).toHaveLength(0);
	});

	it('read-only refuses deletes too', async () => {
		const { transport, calls } = setup({ readOnly: true });
		await expect(transport.request('DELETE' as Method, '/api/notes/1', { deleteCapability: DELETE_CAPABILITY })).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
	});

	it('checkWrite refuses DELETE unless that exact path is allowlisted', () => {
		expect(() => checkWrite('DELETE', '/api/notes/1', { readOnly: false, allowlist: RULES })).toThrow(WriteRefusedError);
		expect(() => checkWrite('DELETE', '/api/contacts/1', { readOnly: false, allowlist: WRITE_ALLOWLIST })).toThrow(WriteRefusedError);
		expect(checkWrite('DELETE', '/api/notes/12', { readOnly: false, allowlist: WRITE_ALLOWLIST }).key).toBe('note.delete');
	});
});

describe('remove (real allowlist)', () => {
	const NOTE = { data: { id: 12, object: 'note', body: 'Likes tea', contact: { id: 7 }, updated_at: '2026-11-20T10:00:00Z' } };
	const ok = (opts: { readOnly?: boolean; dryRun?: boolean; replies?: Parameters<typeof fakeFetch>[0] } = {}) =>
		setup({ readOnly: opts.readOnly ?? false, dryRun: opts.dryRun, allowlist: [...WRITE_ALLOWLIST], replies: opts.replies ?? [{ body: NOTE }, { body: { deleted: true, id: 12 } }] });

	it('reads the record, saves it to the audit log, then deletes it once', async () => {
		const { guards, calls, rows } = ok();
		const res = await guards.remove('note.delete', 12, NOTE.data.updated_at);
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/notes/12', 'DELETE /api/notes/12']);
		expect(res.dryRun).toBe(false);
		const [row] = rows();
		expect(row).toMatchObject({ method: 'DELETE', endpoint: '/api/notes/12', monicaId: 12, result: 'ok' });
		expect(JSON.parse(row.beforeJson!)).toEqual(NOTE.data); // full copy, to recreate by hand if needed
	});

	it('read-only: nothing is read or sent, the refusal is logged', async () => {
		const { guards, calls, rows } = ok({ readOnly: true });
		await expect(guards.remove('note.delete', 12, 'x')).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
		expect(rows()[0].result).toBe('refused:read-only');
	});

	it('stops if the record changed since it was shown (conflict), and deletes nothing', async () => {
		const { guards, calls, rows } = ok();
		await expect(guards.remove('note.delete', 12, '2026-11-19T00:00:00Z')).rejects.toBeInstanceOf(ConflictError);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
		expect(rows()[0].result).toBe('conflict');
	});

	it('dry run: reads and logs, sends no DELETE', async () => {
		const { guards, calls, rows } = ok({ dryRun: true });
		const res = await guards.remove('note.delete', 12, NOTE.data.updated_at);
		expect(res.dryRun).toBe(true);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
		expect(rows()[0].result).toBe('dry-run');
	});

	it('already gone (404 on read): nothing is deleted', async () => {
		const { guards, calls } = ok({ replies: [{ status: 404 }] });
		await expect(guards.remove('note.delete', 12, 'x')).rejects.toThrow(/404/);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
	});

	it('contacts can never be removed, whatever key is asked for', async () => {
		const { guards, calls } = ok();
		await expect(guards.remove('contact.delete', 7, 'x')).rejects.toMatchObject({ reason: 'not-allowlisted' });
		expect(calls).toHaveLength(0);
	});
});

describe('allowlist', () => {
	it('contains exactly the approved writes: creating and removing hangouts, notes and journal entries', () => {
		expect(WRITE_ALLOWLIST.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
			'DELETE /api/activities/{id}',
			'DELETE /api/journal/{id}',
			'DELETE /api/notes/{id}',
			'POST /api/activities',
			'POST /api/notes'
		]);
		expect(WRITE_ALLOWLIST.some((r) => r.method === 'PUT')).toBe(false);
		expect(WRITE_ALLOWLIST.some((r) => r.path.includes('contacts'))).toBe(false);
	});

	it('real rules: activity and note fields are limited to what the Log form sends', () => {
		const byKey = Object.fromEntries(WRITE_ALLOWLIST.map((r) => [r.key, [...r.editableFields].sort()]));
		expect(byKey['activity.create']).toEqual(['activity_type_id', 'contacts', 'description', 'happened_at', 'summary']);
		expect(byKey['note.create']).toEqual(['body', 'contact_id']);
	});

	it('with the real allowlist, read-only still refuses everything and sends nothing', async () => {
		const { guards, calls, rows } = setup({ readOnly: true, allowlist: [...WRITE_ALLOWLIST] });
		await expect(guards.create('activity.create', { summary: 'x', happened_at: '2026-11-20', contacts: [1] })).rejects.toMatchObject({ reason: 'read-only' });
		await expect(guards.create('note.create', { contact_id: 1, body: 'x' })).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
		expect(rows().map((r) => r.result)).toEqual(['refused:read-only', 'refused:read-only']);
	});

	it('with the real allowlist, an activity is created once, audited before and after', async () => {
		const response = { data: { id: 99, object: 'activity', summary: 'Dinner' } };
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: response }] });
		const body = { summary: 'Dinner', happened_at: '2026-11-20', contacts: [1, 3] };
		const res = await guards.create('activity.create', body);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: 'POST', body });
		expect(new URL(calls[0].url).pathname).toBe('/api/activities');
		expect(res.response).toEqual(response);
		const [row] = rows();
		expect(row).toMatchObject({ method: 'POST', endpoint: '/api/activities', result: 'ok', dryRun: false });
		expect(JSON.parse(row.afterJson!)).toEqual(response);
	});

	it('with the real allowlist, unknown fields are refused (e.g. account_id)', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST] });
		await expect(guards.create('note.create', { contact_id: 1, body: 'x', account_id: 2 })).rejects.toMatchObject({ reason: 'field-not-editable' });
		expect(calls).toHaveLength(0);
	});

	it('updates are still impossible, and so is deleting a contact', async () => {
		const { guards, transport, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST] });
		await expect(guards.update('contact.update', 1, {}, 'x')).rejects.toMatchObject({ reason: 'not-allowlisted' });
		expect(() => checkWrite('PUT', '/api/contacts/1', { readOnly: false, allowlist: WRITE_ALLOWLIST })).toThrow(/not on the write allowlist/);
		await expect(transport.request('DELETE' as Method, '/api/contacts/1', { deleteCapability: DELETE_CAPABILITY })).rejects.toMatchObject({ reason: 'delete-forbidden' });
		expect(calls).toHaveLength(0);
	});

	it('refuses paths and methods that are not listed', () => {
		const o = { readOnly: false, allowlist: RULES };
		expect(() => checkWrite('POST', '/api/contacts', o)).toThrow(/not on the write allowlist/);
		expect(() => checkWrite('PUT', '/api/notes', o)).toThrow(/not on the write allowlist/);
		expect(() => checkWrite('PUT', '/api/things/abc', o)).toThrow(/not on the write allowlist/);
		expect(() => checkWrite('PUT', '/api/things/1/extra', o)).toThrow(/not on the write allowlist/);
		expect(checkWrite('PUT', '/api/things/12', o).key).toBe('thing.update');
	});

	it('refuses fields that are not editable', async () => {
		const { guards, calls, rows } = setup({ readOnly: false });
		await expect(guards.update('thing.update', 42, { first_name: 'Eve' }, CURRENT.data.updated_at)).rejects.toMatchObject({
			reason: 'field-not-editable'
		});
		expect(calls).toHaveLength(0);
		expect(rows()[0].result).toBe('refused:field-not-editable');
	});
});

describe('dry run', () => {
	it('sends nothing for create and records what would be sent', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, dryRun: true });
		const res = await guards.create('note.create', { body: 'hello', contact_id: 7 });
		expect(res.dryRun).toBe(true);
		expect(calls).toHaveLength(0);
		const [row] = rows();
		expect(row).toMatchObject({ method: 'POST', endpoint: '/api/notes', dryRun: true, result: 'dry-run' });
		expect(JSON.parse(row.afterJson!)).toEqual({ body: 'hello', contact_id: 7 });
	});

	it('for update, only performs the GET and no PUT', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, dryRun: true });
		const res = await guards.update('thing.update', 42, { nickname: 'Ada L.' }, CURRENT.data.updated_at);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
		expect(res.payload.nickname).toBe('Ada L.');
		expect(rows()[0].result).toBe('dry-run');
	});
});

describe('fetch-merge-send', () => {
	it('GETs the current record, keeps untouched fields, changes only the edited one', async () => {
		const { guards, calls, invalidated } = setup({ readOnly: false });
		await guards.update('thing.update', 42, { nickname: 'Ada L.' }, CURRENT.data.updated_at);
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/things/42', 'PUT /api/things/42']);
		expect(calls[1].body).toEqual({
			first_name: 'Ada',
			last_name: 'Lovelace',
			nickname: 'Ada L.',
			gender_id: 2,
			description: 'Keep me'
		});
		expect(invalidated()).toBe(1);
	});

	it('writes before and after JSON to the audit log', async () => {
		const { guards, rows } = setup({ readOnly: false });
		await guards.update('thing.update', 42, { nickname: 'Ada L.' }, CURRENT.data.updated_at);
		const [row] = rows();
		expect(row).toMatchObject({ method: 'PUT', endpoint: '/api/things/42', monicaId: 42, dryRun: false, result: 'ok' });
		expect(JSON.parse(row.beforeJson!)).toEqual(CURRENT.data);
		expect(JSON.parse(row.afterJson!)).toEqual({ data: { ok: true } });
	});

	it('records a failed send as an error, not ok', async () => {
		const { guards, rows } = setup({ readOnly: false, replies: [{ body: CURRENT }, { status: 422, body: {} }] });
		await expect(guards.update('thing.update', 42, { nickname: 'x' }, CURRENT.data.updated_at)).rejects.toThrow(/422/);
		expect(rows()[0].result).toMatch(/^error:.*422/);
	});

	it('sends nothing if the audit log cannot be written', async () => {
		const f = fakeFetch([{ body: CURRENT }, { body: {} }]);
		const transport = createTransport({ baseUrl: BASE, token: 't', readOnly: false, fetch: f.fetch, ...fakeClock() });
		const guards = createGuards({
			transport,
			readOnly: false,
			dryRun: false,
			allowlist: RULES,
			audit: {
				start: () => {
					throw new Error('disk full');
				},
				finish: () => {}
			}
		});
		await expect(guards.update('thing.update', 42, { nickname: 'x' }, CURRENT.data.updated_at)).rejects.toThrow('disk full');
		expect(f.calls.map((c) => c.method)).toEqual(['GET']);
	});
});

describe('conflict check', () => {
	it('stops when updated_at changed since the UI loaded the record', async () => {
		const { guards, calls, rows } = setup({ readOnly: false });
		const err = await guards.update('thing.update', 42, { nickname: 'x' }, '2026-11-19T00:00:00Z').catch((e) => e);
		expect(err).toBeInstanceOf(ConflictError);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
		expect(rows()[0].result).toBe('conflict');
	});
});
