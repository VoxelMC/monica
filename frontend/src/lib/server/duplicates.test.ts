import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { recentAudit } from './audit';
import { contactMeta, groupMembers, groups, reminders } from './db/schema';
import { mergeDuplicate, moveOrbitData } from './duplicates';
import { createMonicaClient, createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit, type Call } from './monica/test-helpers';

const stats = { number_of_calls: 0, number_of_notes: 0, number_of_activities: 0, number_of_reminders: 0, number_of_tasks: 0, number_of_gifts: 0, number_of_debts: 0 };
function person(id: number, extra: Record<string, unknown> = {}) {
	return {
		id,
		object: 'contact',
		hash_id: `h${id}`,
		first_name: 'Kayla',
		last_name: 'Preocanin',
		nickname: null,
		complete_name: 'Kayla Preocanin',
		initials: 'KP',
		is_starred: false,
		is_partial: false,
		is_active: true,
		is_dead: false,
		is_me: false,
		description: null,
		tags: [] as { id: number; name: string }[],
		contactFields: [] as unknown[],
		addresses: [],
		statistics: stats,
		information: { avatar: { source: 'default', url: null as string | null, default_avatar_color: '#123456' }, dates: { birthdate: { date: null } }, relationships: {}, career: {}, how_you_met: {} },
		created_at: '2026-11-20T00:00:00Z',
		updated_at: `T${id}`,
		...extra
	};
}

async function monicaFake() {
	const jpeg = (await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#88aa44' } }).jpeg().toBuffer()).toString('base64');
	const keep = person(1, { tags: [{ id: 1, name: 'Van' }] });
	const copy = person(2, {
		tags: [{ id: 2, name: 'OG' }],
		contactFields: [{ id: 9, content: 'k@example.test', contact_field_type: { id: 1, name: 'Email', type: 'email' } }],
		information: { ...person(2).information, avatar: { source: 'photo', url: 'http://x/store/photos/new.jpg', default_avatar_color: '#123456' } }
	});
	let n = 0;
	const f = fakeFetch((c: Call) => {
		const u = new URL(c.url);
		const p = u.pathname;
		const bump = () => (keep.updated_at = `T1-${++n}`);
		if (c.method === 'GET' && p === '/api/contacts/1') return { body: { data: keep } };
		if (c.method === 'GET' && p === '/api/contacts/2') return { body: { data: copy } };
		if (c.method === 'GET' && p === '/api/contacts/2/photos') return { body: { data: [{ id: 5, new_filename: 'photos/new.jpg', mime_type: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${jpeg}` }], meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 } } };
		if (c.method === 'GET') return { body: { data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 1 } } };
		if (p === '/api/contacts/1/setTags') {
			keep.tags.push({ id: 3, name: (c.body as { tags: string[] }).tags[0] });
			bump();
			return { body: { data: keep } };
		}
		if (p === '/api/contactfields') {
			keep.contactFields.push({ id: 10, content: (c.body as { data: string }).data, contact_field_type: { id: 1, name: 'Email', type: 'email' } });
			bump();
			return { body: { data: {} } };
		}
		if (p === '/api/photos') return { body: { data: { id: 77 } } };
		if (p === '/api/contacts/1/avatar') {
			keep.information = { ...keep.information, avatar: { source: 'photo', url: 'http://x/store/photos/77.jpg', default_avatar_color: '#123456' } };
			bump();
			return { body: { data: keep } };
		}
		if (c.method === 'DELETE' && p === '/api/contacts/2') return { body: { deleted: true } };
		return { status: 404, body: {} };
	});
	return { f, keep, copy };
}

function setup(f: ReturnType<typeof fakeFetch>, o: { readOnly?: boolean; dryRun?: boolean } = {}) {
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: o.readOnly ?? false, fetch: f.fetch, ...fakeClock() });
	const monica = createMonicaClient(transport, { cacheTtlMs: 60_000 });
	const { db, audit } = memoryAudit();
	const guards = createGuards({ transport, readOnly: o.readOnly ?? false, dryRun: o.dryRun ?? false, audit, allowlist: WRITE_ALLOWLIST, onWrite: () => monica.invalidate() });
	return { monica, db, guards, rows: () => recentAudit(db).reverse() };
}
const fd = (o: Record<string, string>) => {
	const x = new FormData();
	for (const [k, v] of Object.entries(o)) x.set(k, v);
	return x;
};
const good = { keep: '1', copy: '2', keepUpdatedAt: 'T1', copyUpdatedAt: 'T2', photo: 'copy' };

describe('mergeDuplicate', () => {
	it('adds the tag, the email and the photo to the person kept, then deletes the copy (in that order)', async () => {
		const { f } = await monicaFake();
		const { monica, db, guards, rows } = setup(f);
		const r = await mergeDuplicate(guards, db, monica, fd(good));
		expect(r).toMatchObject({ ok: true, dryRun: false });
		expect(r.message).toMatch(/added tag OG, k@example.test, photo/);
		const writes = f.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${new URL(c.url).pathname}`);
		expect(writes).toEqual(['POST /api/contacts/1/setTags', 'POST /api/contactfields', 'POST /api/photos', 'PUT /api/contacts/1/avatar', 'DELETE /api/contacts/2']);
		// the uploaded photo was shrunk to orbit's photo limit
		const upload = f.calls.find((c) => new URL(c.url).pathname === '/api/photos')!.body as { contact_id: number; data: string };
		expect(upload.contact_id).toBe(1);
		expect(upload.data.length).toBeLessThan(350_000);
		expect(rows().map((x) => x.result)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
	});

	it('refuses when either was changed since the page was opened, or the copy holds notes; nothing is written', async () => {
		const { f, copy } = await monicaFake();
		const a = setup(f);
		expect((await mergeDuplicate(a.guards, a.db, a.monica, fd({ ...good, keepUpdatedAt: 'old' }))).message).toMatch(/changed somewhere else/);
		copy.statistics = { ...stats, number_of_notes: 2 };
		expect((await mergeDuplicate(a.guards, a.db, a.monica, fd(good))).message).toMatch(/2 notes/);
		expect(f.calls.some((c) => c.method !== 'GET')).toBe(false);
	});

	it('read-only and dry run delete nothing', async () => {
		const ro = await monicaFake();
		const a = setup(ro.f, { readOnly: true });
		expect((await mergeDuplicate(a.guards, a.db, a.monica, fd(good))).message).toMatch(/read-only.*Nothing was changed/);
		expect(ro.f.calls.some((c) => c.method !== 'GET')).toBe(false);
		const dry = await monicaFake();
		const b = setup(dry.f, { dryRun: true });
		expect(await mergeDuplicate(b.guards, b.db, b.monica, fd(good))).toMatchObject({ ok: true, dryRun: true });
		expect(dry.f.calls.some((c) => c.method !== 'GET')).toBe(false);
	});
});

describe('moveOrbitData', () => {
	it("moves reminders and group membership to the person kept; the kept person's catch-up target wins", () => {
		const { db } = memoryAudit();
		const now = new Date().toISOString();
		const g = db.insert(groups).values({ name: 'Van', createdAt: now }).returning().get();
		db.insert(groupMembers).values([{ groupId: g.id, monicaContactId: 1, addedAt: now }, { groupId: g.id, monicaContactId: 2, addedAt: now }] as never).run();
		db.insert(contactMeta).values([{ monicaContactId: 1, catchupIntervalDays: 14, updatedAt: now }, { monicaContactId: 2, catchupIntervalDays: 30, updatedAt: now }] as never).run();
		db.insert(reminders).values({ monicaContactId: 2, contactName: 'Kayla', note: '', dueAt: now, timeZone: 'UTC', createdAt: now }).run();
		moveOrbitData(db, 2, 1);
		expect(db.select().from(groupMembers).all().map((m) => m.monicaContactId)).toEqual([1]);
		expect(db.select().from(contactMeta).all()).toMatchObject([{ monicaContactId: 1, catchupIntervalDays: 14 }]);
		expect(db.select().from(reminders).where(eq(reminders.monicaContactId, 1)).all()).toHaveLength(1);
	});
});
