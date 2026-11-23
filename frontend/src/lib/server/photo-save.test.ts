import { describe, expect, it } from 'vitest';
import { recentAudit } from './audit';
import { savePhoto } from './photo-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' + 'A'.repeat(400);
const CONTACT = { data: { id: 7, object: 'contact', information: { avatar: { source: 'photo', url: 'x/old.jpg' } }, updated_at: 'T1' } };

function setup(opts: { readOnly?: boolean; dryRun?: boolean; replies?: Parameters<typeof fakeFetch>[0] } = {}) {
	const f = fakeFetch(opts.replies ?? [{ body: { data: { id: 99, object: 'photo' } } }, { body: CONTACT }, { body: CONTACT }]);
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: opts.readOnly ?? false, fetch: f.fetch, ...fakeClock() });
	const { db, audit } = memoryAudit();
	const guards = createGuards({ transport, readOnly: opts.readOnly ?? false, dryRun: opts.dryRun ?? false, audit, allowlist: WRITE_ALLOWLIST });
	return { ...f, guards, rows: () => recentAudit(db).reverse() };
}
const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const good = { contactId: '7', updatedAt: 'T1', photo: JPEG };

describe('savePhoto', () => {
	it('uploads, then sets the avatar with the conflict check', async () => {
		const { guards, calls, rows } = setup();
		const r = await savePhoto(guards, fd(good));
		expect(r).toMatchObject({ ok: true, photoId: 99 });
		expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['POST /api/photos', 'GET /api/contacts/7', 'PUT /api/contacts/7/avatar']);
		expect(calls[2].body).toEqual({ source: 'photo', photo_id: 99 });
		expect(rows().map((x) => x.result)).toEqual(['ok', 'ok']);
	});

	it('conflict: the photo is uploaded but not set, and the message says so', async () => {
		const { guards, calls } = setup();
		const r = await savePhoto(guards, fd({ ...good, updatedAt: 'T0' }));
		expect(r).toMatchObject({ ok: false, photoId: 99 });
		expect(r.message).toMatch(/changed somewhere else.*uploaded to Monica.*not the profile photo/);
		expect(calls.map((c) => c.method)).toEqual(['POST', 'GET']);
	});

	it('a failed upload stops before the avatar', async () => {
		const { guards, calls } = setup({ replies: [{ status: 422, body: {} }] });
		const r = await savePhoto(guards, fd(good));
		expect(r.ok).toBe(false);
		expect(r.message).toMatch(/Nothing was changed/);
		expect(calls).toHaveLength(1);
	});

	it('refuses bad input before sending anything; read-only and dry run send nothing', async () => {
		const { guards, calls } = setup();
		expect((await savePhoto(guards, fd({ ...good, photo: 'data:image/gif;base64,R0lGOD' }))).ok).toBe(false);
		expect((await savePhoto(guards, fd({ ...good, contactId: 'x' }))).ok).toBe(false);
		expect((await savePhoto(guards, fd({ contactId: '7', updatedAt: 'T1' }))).ok).toBe(false);
		expect(calls).toHaveLength(0);
		const ro = setup({ readOnly: true });
		expect((await savePhoto(ro.guards, fd(good))).message).toMatch(/read-only/);
		expect(ro.calls).toHaveLength(0);
		const dry = setup({ dryRun: true });
		expect(await savePhoto(dry.guards, fd(good))).toMatchObject({ ok: true, dryRun: true });
		expect(dry.calls).toHaveLength(0);
	});
});
