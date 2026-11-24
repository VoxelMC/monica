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
			'POST /api/contactfields',
			'POST /api/contacts/{id}/setTags',
			'POST /api/contacts/{id}/unsetTag',
			'POST /api/journal',
			'POST /api/notes',
			'POST /api/photos',
			'PUT /api/contactfields/{id}',
			'PUT /api/contacts/{id}',
			'PUT /api/contacts/{id}', // add a birthday; correct a birthday
			'PUT /api/contacts/{id}/avatar',
			'PUT /api/tags/{id}'
		]);
		// The only contact updates are the birthday (add, correct) and avatar rules, and contacts can never be deleted
		expect(WRITE_ALLOWLIST.filter((r) => r.method === 'PUT' && r.path.startsWith('/api/contacts')).map((r) => r.key)).toEqual(['contact.birthday', 'contact.birthday.change', 'contact.avatar']);
		expect(WRITE_ALLOWLIST.some((r) => r.method === 'DELETE' && r.path.includes('contacts'))).toBe(false);
		expect(WRITE_ALLOWLIST.some((r) => r.path.endsWith('/unsetTags'))).toBe(false);
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

	it('general contact updates are impossible (only contact.birthday), and so is deleting a contact', async () => {
		const { guards, transport, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST] });
		await expect(guards.update('contact.update', 1, {}, 'x')).rejects.toMatchObject({ reason: 'not-allowlisted' });
		expect(() => checkWrite('PUT', '/api/contacts/1/stayInTouch', { readOnly: false, allowlist: WRITE_ALLOWLIST })).toThrow(/not on the write allowlist/);
		expect(() => checkWrite('DELETE', '/api/contactfields/1', { readOnly: false, allowlist: WRITE_ALLOWLIST })).toThrow(/does not delete/);
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

describe('contact.birthday (PUT, fetch-merge-send)', () => {
	const CONTACT = {
		data: {
			id: 7, object: 'contact', first_name: 'Ada', last_name: 'Lovelace', nickname: 'Countess', description: 'Mathematician',
			gender: 'Woman', is_dead: false,
			information: { dates: { birthdate: { is_age_based: null, is_year_unknown: null, date: null }, deceased_date: { is_age_based: null, is_year_unknown: null, date: null } } },
			updated_at: '2026-11-20T10:00:00Z'
		}
	};
	const changes = { is_birthdate_known: true, birthdate_day: 10, birthdate_month: 12, birthdate_year: 1990, birthdate_is_age_based: false, birthdate_add_reminder: true };
	const run = (current: { data: Record<string, unknown> } = CONTACT, opts: { readOnly?: boolean } = {}) =>
		setup({ readOnly: opts.readOnly ?? false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: current }, { body: { data: { ...current.data, updated_at: 'later' } } }] });

	it('reads the contact, then PUTs the birthday plus everything Monica would otherwise blank', async () => {
		const { guards, calls, rows } = run();
		await guards.update('contact.birthday', 7, changes, CONTACT.data.updated_at);
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/contacts/7', 'PUT /api/contacts/7']);
		expect(calls[1].body).toEqual({
			first_name: 'Ada',
			description: 'Mathematician',
			is_deceased: false,
			is_deceased_date_known: false,
			...changes
		});
		// last name, nickname and gender are not sent, so Monica leaves them as they are
		for (const k of ['last_name', 'nickname', 'gender_id', 'middle_name']) expect(calls[1].body).not.toHaveProperty(k);
		expect(JSON.parse(rows()[0].beforeJson!)).toEqual(CONTACT.data);
	});

	it('keeps a deceased date exactly', async () => {
		const dead = { data: { ...CONTACT.data, is_dead: true, information: { dates: { ...CONTACT.data.information.dates, deceased_date: { is_age_based: false, is_year_unknown: false, date: '2020-06-05T00:00:00Z' } } } } };
		const { guards, calls } = run(dead);
		await guards.update('contact.birthday', 7, changes, CONTACT.data.updated_at);
		expect(calls[1].body).toMatchObject({ is_deceased: true, is_deceased_date_known: true, deceased_date_day: 5, deceased_date_month: 6, deceased_date_year: 2020 });
	});

	it('refuses to overwrite an existing birthday, and sends no PUT', async () => {
		const has = { data: { ...CONTACT.data, information: { dates: { ...CONTACT.data.information.dates, birthdate: { is_age_based: false, is_year_unknown: false, date: '1991-01-01T00:00:00Z' } } } } };
		const { guards, calls, rows } = run(has);
		await expect(guards.update('contact.birthday', 7, changes, CONTACT.data.updated_at)).rejects.toMatchObject({ reason: 'precondition' });
		expect(calls.map((c) => c.method)).toEqual(['GET']);
		expect(rows()[0].result).toBe('refused:precondition');
	});

	it('only birthday fields may be changed', async () => {
		const { guards, calls } = run();
		await expect(guards.update('contact.birthday', 7, { first_name: 'Eve' }, CONTACT.data.updated_at)).rejects.toMatchObject({ reason: 'field-not-editable' });
		await expect(guards.update('contact.birthday', 7, { description: 'x' }, CONTACT.data.updated_at)).rejects.toMatchObject({ reason: 'field-not-editable' });
		expect(calls).toHaveLength(0);
	});

	it('conflict: the contact changed since the page loaded, nothing is sent', async () => {
		const { guards, calls } = run();
		await expect(guards.update('contact.birthday', 7, changes, '2026-01-01T00:00:00Z')).rejects.toBeInstanceOf(ConflictError);
		expect(calls.map((c) => c.method)).toEqual(['GET']);
	});

	it('read-only refuses before reading anything', async () => {
		const { guards, calls } = run(CONTACT, { readOnly: true });
		await expect(guards.update('contact.birthday', 7, changes, 'x')).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
	});
});

describe('tags (POST setTags / unsetTag, one contact, one tag per request)', () => {
	const reply = { data: { id: 7, object: 'contact', tags: [{ id: 3, name: 'Paris' }] } };
	const run = (readOnly = false) => setup({ readOnly, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: reply }] });

	it('adds one tag by name to one contact', async () => {
		const { guards, calls, rows } = run();
		await guards.create('contact.tags.add', { tags: ['Paris'] }, 7);
		expect(calls[0]).toMatchObject({ method: 'POST', body: { tags: ['Paris'] } });
		expect(new URL(calls[0].url).pathname).toBe('/api/contacts/7/setTags');
		expect(rows()[0]).toMatchObject({ endpoint: '/api/contacts/7/setTags', monicaId: 7, result: 'ok' });
	});

	it('removes one tag by id from one contact (the tag itself stays in Monica)', async () => {
		const { guards, calls } = run();
		await guards.create('contact.tags.remove', { tags: [3] }, 7);
		expect(new URL(calls[0].url).pathname).toBe('/api/contacts/7/unsetTag');
		expect(calls[0].body).toEqual({ tags: [3] });
	});

	it('refuses malformed bodies: several tags, empty names, wrong types, missing contact', async () => {
		const { guards, calls } = run();
		for (const body of [{ tags: ['A', 'B'] }, { tags: [''] }, { tags: [' '] }, { tags: [3] }, { tags: 'Paris' }, {}]) {
			await expect(guards.create('contact.tags.add', body as Record<string, unknown>, 7)).rejects.toBeInstanceOf(WriteRefusedError);
		}
		await expect(guards.create('contact.tags.remove', { tags: ['Paris'] }, 7)).rejects.toBeInstanceOf(WriteRefusedError);
		await expect(guards.create('contact.tags.add', { tags: ['Paris'] })).rejects.toBeInstanceOf(WriteRefusedError); // no contact id
		expect(calls).toHaveLength(0);
	});

	it('read-only refuses', async () => {
		const { guards, calls } = run(true);
		await expect(guards.create('contact.tags.add', { tags: ['Paris'] }, 7)).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
	});
});

describe('journal.create (POST /api/journal)', () => {
	it('sends only title and post', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: { data: { id: 5, object: 'entry' } } }] });
		await guards.create('journal.create', { title: 'Whistler', post: 'Great hike' });
		expect(calls[0]).toMatchObject({ method: 'POST', body: { title: 'Whistler', post: 'Great hike' } });
		await expect(guards.create('journal.create', { title: 'x', post: 'y', date: '2026-01-01' })).rejects.toMatchObject({ reason: 'field-not-editable' });
		await expect(guards.create('journal.create', { title: 'x', post: 'y' }, 3)).rejects.toBeInstanceOf(WriteRefusedError); // no id on this path
	});
});

describe('contact photos (POST /api/photos, then PUT /api/contacts/{id}/avatar)', () => {
	// A real 1x1 JPEG header followed by padding: enough for the magic-byte and size checks
	const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' + 'A'.repeat(400);
	const CONTACT = { data: { id: 7, object: 'contact', first_name: 'Ada', information: { avatar: { source: 'photo', url: 'x/old.jpg' } }, updated_at: '2026-11-20T10:00:00Z' } };

	it('uploads one image for one contact', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: { data: { id: 99, object: 'photo' } } }] });
		await guards.create('photo.upload', { contact_id: 7, data: JPEG });
		expect(calls[0]).toMatchObject({ method: 'POST', body: { contact_id: 7, data: JPEG } });
		expect(new URL(calls[0].url).pathname).toBe('/api/photos');
		expect(rows()[0]).toMatchObject({ endpoint: '/api/photos', result: 'ok' });
	});

	it('refuses anything that is not a real JPEG/PNG/WebP within the size limit, or has no contact', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		const bad = [
			{ contact_id: 7, data: 'data:image/svg+xml;base64,' + 'A'.repeat(400) }, // SVG can carry scripts
			{ contact_id: 7, data: 'data:image/png;base64,/9j/4AAQSkZJRgABAQ' + 'A'.repeat(400) }, // says PNG, is JPEG
			{ contact_id: 7, data: 'data:image/jpeg;base64,' + 'A'.repeat(2_100_000) }, // too large
			{ contact_id: 7, data: 'https://example.com/a.jpg' },
			{ contact_id: 7, data: 'data:image/jpeg;base64,/9j/' }, // empty
			{ data: JPEG },
			{ contact_id: 0, data: JPEG }
		];
		for (const body of bad) await expect(guards.create('photo.upload', body)).rejects.toMatchObject({ reason: 'invalid-body' });
		await expect(guards.create('photo.upload', { contact_id: 7, data: JPEG, extension: 'php' })).rejects.toMatchObject({ reason: 'field-not-editable' });
		await expect(guards.create('photo.upload', { contact_id: 7, data: JPEG }, 7)).rejects.toMatchObject({ reason: 'bad-path' });
		expect(calls).toHaveLength(0);
	});

	it('sets the avatar: reads the contact, checks for conflicts, sends only source and photo_id', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: CONTACT }, { body: CONTACT }] });
		await guards.update('contact.avatar', 7, { source: 'photo', photo_id: 99 }, CONTACT.data.updated_at);
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/contacts/7', 'PUT /api/contacts/7/avatar']);
		expect(calls[1].body).toEqual({ source: 'photo', photo_id: 99 });
		expect(rows()[0]).toMatchObject({ endpoint: '/api/contacts/7/avatar', monicaId: 7, result: 'ok' });
		expect(JSON.parse(rows()[0].beforeJson!)).toMatchObject({ information: { avatar: { url: 'x/old.jpg' } } }); // the old avatar is on record
	});

	it('avatar: conflict, other sources, other fields and read-only are refused with no PUT', async () => {
		const conflict = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: CONTACT }] });
		await expect(conflict.guards.update('contact.avatar', 7, { source: 'photo', photo_id: 99 }, 'older')).rejects.toBeInstanceOf(ConflictError);
		expect(conflict.calls.map((c) => c.method)).toEqual(['GET']);
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		for (const changes of [{ source: 'default' }, { source: 'gravatar' }, { source: 'photo' }, { source: 'photo', photo_id: '99' }]) {
			await expect(guards.update('contact.avatar', 7, changes, 'x')).rejects.toMatchObject({ reason: 'invalid-body' });
		}
		await expect(guards.update('contact.avatar', 7, { source: 'photo', photo_id: 9, first_name: 'X' }, 'x')).rejects.toMatchObject({ reason: 'field-not-editable' });
		const ro = setup({ readOnly: true, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		await expect(ro.guards.update('contact.avatar', 7, { source: 'photo', photo_id: 9 }, 'x')).rejects.toMatchObject({ reason: 'read-only' });
		await expect(ro.guards.create('photo.upload', { contact_id: 7, data: JPEG })).rejects.toMatchObject({ reason: 'read-only' });
		expect(calls).toHaveLength(0);
		expect(ro.calls).toHaveLength(0);
	});
});

describe('contact.birthday.change (PUT, only when a birthday exists)', () => {
	const WITH = {
		data: {
			id: 7, object: 'contact', first_name: 'Ada', description: 'Mathematician', is_dead: false,
			information: { dates: { birthdate: { is_age_based: false, is_year_unknown: false, date: '1990-12-01T00:00:00Z' }, deceased_date: { date: null } } },
			updated_at: 'T1'
		}
	};
	const WITHOUT = { data: { ...WITH.data, information: { dates: { birthdate: { date: null }, deceased_date: { date: null } } } } };
	const changes = { is_birthdate_known: true, birthdate_day: 10, birthdate_month: 12, birthdate_year: 1990, birthdate_is_age_based: false, birthdate_add_reminder: true };

	it('reads the contact, then PUTs the new birthday plus what Monica would otherwise blank', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: WITH }, { body: WITH }] });
		await guards.update('contact.birthday.change', 7, changes, 'T1');
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/contacts/7', 'PUT /api/contacts/7']);
		expect(calls[1].body).toEqual({ first_name: 'Ada', description: 'Mathematician', is_deceased: false, is_deceased_date_known: false, ...changes });
		expect(JSON.parse(rows()[0].beforeJson!).information.dates.birthdate.date).toBe('1990-12-01T00:00:00Z'); // old date on record
	});
	it('refuses a contact with no birthday (that is contact.birthday), with no PUT', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: WITHOUT }] });
		await expect(guards.update('contact.birthday.change', 7, changes, 'T1')).rejects.toMatchObject({ reason: 'precondition' });
		expect(calls.map((c) => c.method)).toEqual(['GET']);
	});
	it('refuses age-based, unknown or partial dates, other fields, conflicts and read-only', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: WITH }] });
		for (const bad of [{ ...changes, birthdate_is_age_based: true }, { ...changes, is_birthdate_known: false }, { ...changes, birthdate_day: undefined }, { ...changes, birthdate_add_reminder: 'yes' }]) {
			await expect(guards.update('contact.birthday.change', 7, bad as Record<string, unknown>, 'T1')).rejects.toMatchObject({ reason: 'invalid-body' });
		}
		await expect(guards.update('contact.birthday.change', 7, { ...changes, nickname: 'x' }, 'T1')).rejects.toMatchObject({ reason: 'field-not-editable' });
		expect(calls).toHaveLength(0);
		await expect(guards.update('contact.birthday.change', 7, changes, 'T0')).rejects.toBeInstanceOf(ConflictError);
		const ro = setup({ readOnly: true, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		await expect(ro.guards.update('contact.birthday.change', 7, changes, 'T1')).rejects.toMatchObject({ reason: 'read-only' });
		expect(ro.calls).toHaveLength(0);
	});
});

describe('tag.rename (PUT /api/tags/{id})', () => {
	const TAG = { data: { id: 4, object: 'tag', name: 'Van', name_slug: 'van', updated_at: 'T1' } };
	it('reads the tag, checks for conflicts, sends only the new name', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: TAG }, { body: { data: { ...TAG.data, name: 'Vancouver' } } }] });
		await guards.update('tag.rename', 4, { name: 'Vancouver' }, 'T1');
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/tags/4', 'PUT /api/tags/4']);
		expect(calls[1].body).toEqual({ name: 'Vancouver' });
		expect(JSON.parse(rows()[0].beforeJson!).name).toBe('Van');
	});
	it('refuses empty or padded names, other fields, conflicts and read-only', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: TAG }] });
		for (const name of ['', ' Van', 'x'.repeat(256), 3]) await expect(guards.update('tag.rename', 4, { name }, 'T1')).rejects.toMatchObject({ reason: 'invalid-body' });
		await expect(guards.update('tag.rename', 4, { name: 'A', name_slug: 'a' }, 'T1')).rejects.toMatchObject({ reason: 'field-not-editable' });
		expect(calls).toHaveLength(0);
		await expect(guards.update('tag.rename', 4, { name: 'A' }, 'T0')).rejects.toBeInstanceOf(ConflictError);
		const ro = setup({ readOnly: true, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		await expect(ro.guards.update('tag.rename', 4, { name: 'A' }, 'T1')).rejects.toMatchObject({ reason: 'read-only' });
		expect(ro.calls).toHaveLength(0);
	});
});

describe('phones and emails (POST /api/contactfields, PUT /api/contactfields/{id})', () => {
	const FIELD = { data: { id: 29, object: 'contactfield', content: '+1 778-363-4155', contact_field_type: { id: 2, name: 'Phone', type: 'phone' }, labels: [{ id: 2 }], contact: { id: 13 }, updated_at: 'T1' } };
	it('adds one field for one contact', async () => {
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: FIELD }] });
		await guards.create('contactfield.create', { contact_id: 13, contact_field_type_id: 1, data: 'a@b.test' });
		expect(calls[0]).toMatchObject({ method: 'POST', body: { contact_id: 13, contact_field_type_id: 1, data: 'a@b.test' } });
	});
	it('changes only the text; contact and type are sent back unchanged, labels are not sent', async () => {
		const { guards, calls, rows } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: FIELD }, { body: FIELD }] });
		await guards.update('contactfield.update', 29, { data: '+1 778-363-0000' }, 'T1');
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /api/contactfields/29', 'PUT /api/contactfields/29']);
		expect(calls[1].body).toEqual({ contact_id: 13, contact_field_type_id: 2, data: '+1 778-363-0000' });
		expect(JSON.parse(rows()[0].beforeJson!).content).toBe('+1 778-363-4155');
	});
	it('refuses social links, bad values, other fields, conflicts and read-only; removing is impossible', async () => {
		const social = { data: { ...FIELD.data, contact_field_type: { id: 3, name: 'Facebook', type: null } } };
		const s1 = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: social }] });
		await expect(s1.guards.update('contactfield.update', 29, { data: 'x' }, 'T1')).rejects.toMatchObject({ reason: 'precondition' });
		expect(s1.calls.map((c) => c.method)).toEqual(['GET']);
		const { guards, calls } = setup({ readOnly: false, allowlist: [...WRITE_ALLOWLIST], replies: [{ body: FIELD }] });
		for (const data of ['', ' a', 'x'.repeat(256), 5]) await expect(guards.update('contactfield.update', 29, { data }, 'T1')).rejects.toMatchObject({ reason: 'invalid-body' });
		await expect(guards.update('contactfield.update', 29, { data: 'a', labels: ['home'] }, 'T1')).rejects.toMatchObject({ reason: 'field-not-editable' });
		await expect(guards.create('contactfield.create', { contact_id: 13, data: 'a' })).rejects.toMatchObject({ reason: 'invalid-body' });
		await expect(guards.remove('contactfield.delete', 29, 'T1')).rejects.toBeInstanceOf(WriteRefusedError);
		expect(calls).toHaveLength(0);
		await expect(guards.update('contactfield.update', 29, { data: 'a' }, 'T0')).rejects.toBeInstanceOf(ConflictError);
		const ro = setup({ readOnly: true, allowlist: [...WRITE_ALLOWLIST], replies: [] });
		await expect(ro.guards.create('contactfield.create', { contact_id: 13, contact_field_type_id: 1, data: 'a' })).rejects.toMatchObject({ reason: 'read-only' });
		expect(ro.calls).toHaveLength(0);
	});
});
