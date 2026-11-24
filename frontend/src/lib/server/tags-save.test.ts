import { describe, expect, it } from 'vitest';
import type { ContactCard } from '../contacts';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';
import { addTagsToContact, mergeTags, renameTag, saveTags } from './tags-save';

const card = (id: number, tags: string[]): ContactCard => ({ id, name: 'P' + id, firstName: null, lastName: null, nickname: null, initials: 'P', color: '#000', hasPhoto: false, starred: false, tags, lastContacted: null, createdAt: 'x', phones: [], emails: [] });
const contacts = [card(1, []), card(2, ['Paris']), card(3, ['paris', 'Work'])];
const tags = [{ id: 10, name: 'Paris' }, { id: 11, name: 'Work' }];
function setup(readOnly = false) {
	const f = fakeFetch(() => ({ body: { data: {} } }));
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
}

describe('saveTags', () => {
	it('adds only to people who lack it, using Monica’s spelling of an existing tag', async () => {
		const { guards, calls } = setup();
		const r = await saveTags(guards, { mode: 'add', contactIds: [1, 2, 3], tag: 'paris' }, contacts, tags);
		expect(r).toMatchObject({ ok: true, done: [1], skipped: 2 });
		expect(calls.map((c) => [new URL(c.url).pathname, c.body])).toEqual([['/api/contacts/1/setTags', { tags: ['Paris'] }]]);
	});
	it('creates a new tag by name when it does not exist yet', async () => {
		const { guards, calls } = setup();
		await saveTags(guards, { mode: 'add', contactIds: [1], tag: '  Climbing ' }, contacts, tags);
		expect(calls[0].body).toEqual({ tags: ['Climbing'] });
	});
	it('removes by tag id, only from people who have it', async () => {
		const { guards, calls } = setup();
		const r = await saveTags(guards, { mode: 'remove', contactIds: [1, 2, 3], tag: 'Paris' }, contacts, tags);
		expect(r).toMatchObject({ ok: true, done: [2, 3], skipped: 1 });
		expect(calls.map((c) => [new URL(c.url).pathname, c.body])).toEqual([
			['/api/contacts/2/unsetTag', { tags: [10] }],
			['/api/contacts/3/unsetTag', { tags: [10] }]
		]);
	});
	it('refuses unknown people, unknown tags to remove, empty names, all before sending', async () => {
		const { guards, calls } = setup();
		expect((await saveTags(guards, { mode: 'add', contactIds: [9], tag: 'X' }, contacts, tags)).message).toMatch(/not in Monica/);
		expect((await saveTags(guards, { mode: 'remove', contactIds: [1], tag: 'Nope' }, contacts, tags)).message).toMatch(/no tag called/);
		expect((await saveTags(guards, { mode: 'add', contactIds: [1], tag: '  ' }, contacts, tags)).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('read-only: stops at the first person, nothing sent', async () => {
		const { guards, calls } = setup(true);
		const r = await saveTags(guards, { mode: 'add', contactIds: [1], tag: 'Work' }, contacts, tags);
		expect(r.message).toMatch(/read-only/);
		expect(calls).toHaveLength(0);
	});
});

describe('addTagsToContact (several tags, one person)', () => {
	it('one request per tag, skipping duplicates and tags they already have', async () => {
		const { guards, calls } = setup();
		const r = await addTagsToContact(guards, 3, ['Climbing', 'work', 'paris', 'climbing ', 'Paris', ' '], contacts, tags);
		expect(r).toMatchObject({ ok: true, added: ['Climbing'], skipped: 2 });
		expect(r.message).toBe('Added “Climbing” (2 already there).');
		expect(calls.map((c) => [new URL(c.url).pathname, c.body])).toEqual([['/api/contacts/3/setTags', { tags: ['Climbing'] }]]);
	});
	it('uses Monica’s spelling and reports each added tag', async () => {
		const { guards, calls } = setup();
		const r = await addTagsToContact(guards, 1, ['paris', 'work'], contacts, tags);
		expect(r.added).toEqual(['Paris', 'Work']);
		expect(calls.map((c) => c.body)).toEqual([{ tags: ['Paris'] }, { tags: ['Work'] }]);
	});
	it('stops at the first failure and says what was added before it', async () => {
		const f = fakeFetch([{ body: { data: {} } }, { status: 500 }]);
		const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: false, fetch: f.fetch, ...fakeClock() });
		const guards = createGuards({ transport, readOnly: false, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST });
		const r = await addTagsToContact(guards, 1, ['Paris', 'Work', 'Climbing'], contacts, tags);
		expect(r).toMatchObject({ ok: false, added: ['Paris'] });
		expect(r.message).toMatch(/^“Work”: .*Added before this: Paris\.$/);
		expect(f.calls).toHaveLength(2);
	});
	it('refuses junk and too many, sending nothing; read-only refuses', async () => {
		const { guards, calls } = setup();
		expect((await addTagsToContact(guards, 1, 'Paris', contacts, tags)).ok).toBe(false);
		expect((await addTagsToContact(guards, 1, Array.from({ length: 21 }, (_, i) => 'T' + i), contacts, tags)).ok).toBe(false);
		expect((await addTagsToContact(guards, 1, ['  '], contacts, tags)).message).toMatch(/Pick or type/);
		expect(calls).toHaveLength(0);
		const ro = setup(true);
		expect((await addTagsToContact(ro.guards, 1, ['Paris'], contacts, tags)).message).toMatch(/read-only/);
		expect(ro.calls).toHaveLength(0);
	});
});

describe('renameTag', () => {
	const fd = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(o)) f.set(k, v);
		return f;
	};
	const TAG = { data: { id: 10, object: 'tag', name: 'Paris', updated_at: 'T1' } };
	const run = () => {
		const f = fakeFetch([{ body: TAG }, { body: TAG }]);
		const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: false, fetch: f.fetch, ...fakeClock() });
		return { ...f, guards: createGuards({ transport, readOnly: false, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
	};
	it('renames with tidy spacing; a case-only change is allowed', async () => {
		const { guards, calls } = run();
		expect(await renameTag(guards, fd({ tagId: '10', name: '  Paris   2026 ', updatedAt: 'T1' }), tags)).toMatchObject({ ok: true, message: 'Renamed “Paris” to “Paris 2026”.' });
		expect(calls[1].body).toEqual({ name: 'Paris 2026' });
		const b = run();
		expect((await renameTag(b.guards, fd({ tagId: '10', name: 'PARIS', updatedAt: 'T1' }), tags)).ok).toBe(true);
	});
	it('refuses a name another tag has (suggests merge), no-ops, unknown tags; sends nothing', async () => {
		const { guards, calls } = run();
		expect((await renameTag(guards, fd({ tagId: '10', name: 'work', updatedAt: 'T1' }), tags)).message).toMatch(/already a tag called “Work”.*Merge/);
		expect((await renameTag(guards, fd({ tagId: '10', name: 'Paris', updatedAt: 'T1' }), tags)).ok).toBe(false);
		expect((await renameTag(guards, fd({ tagId: '99', name: 'X', updatedAt: 'T1' }), tags)).ok).toBe(false);
		expect((await renameTag(guards, fd({ tagId: '10', name: ' ', updatedAt: 'T1' }), tags)).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
	it('conflict: the tag changed since the page loaded', async () => {
		const { guards } = run();
		expect((await renameTag(guards, fd({ tagId: '10', name: 'Lyon', updatedAt: 'T0' }), tags)).message).toMatch(/changed in Monica/);
	});
});

describe('mergeTags', () => {
	const fd = (o: Record<string, string>) => {
		const f = new FormData();
		for (const [k, v] of Object.entries(o)) f.set(k, v);
		return f;
	};
	it('adds B before removing A, per person; skips adding to people who have B', async () => {
		const { guards, calls } = setup();
		// contacts: 2 has Paris; 3 has paris and Work. Merge Paris (10) into Work (11)
		const r = await mergeTags(guards, fd({ fromId: '10', toId: '11' }), contacts, tags);
		expect(r).toMatchObject({ ok: true, moved: 2 });
		expect(calls.map((c) => [new URL(c.url).pathname, c.body])).toEqual([
			['/api/contacts/2/setTags', { tags: ['Work'] }],
			['/api/contacts/2/unsetTag', { tags: [10] }],
			['/api/contacts/3/unsetTag', { tags: [10] }]
		]);
		expect(r.message).toMatch(/Moved 2 people from “Paris” to “Work”.*unused/);
	});
	it('stops at the first failure: that person keeps A (B was added first)', async () => {
		const f = fakeFetch([{ body: { data: {} } }, { status: 500 }]);
		const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: false, fetch: f.fetch, ...fakeClock() });
		const guards = createGuards({ transport, readOnly: false, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST });
		const r = await mergeTags(guards, fd({ fromId: '10', toId: '11' }), contacts, tags);
		expect(r).toMatchObject({ ok: false, moved: 0 });
		expect(r.message).toMatch(/P2: .*Moved 0 of 2/);
		expect(f.calls).toHaveLength(2);
	});
	it('refuses same tag, unknown tags; nobody to move is fine', async () => {
		const { guards, calls } = setup();
		expect((await mergeTags(guards, fd({ fromId: '10', toId: '10' }), contacts, tags)).ok).toBe(false);
		expect((await mergeTags(guards, fd({ fromId: '10', toId: '99' }), contacts, tags)).ok).toBe(false);
		expect(await mergeTags(guards, fd({ fromId: '11', toId: '10' }), [card(1, [])], tags)).toMatchObject({ ok: true, moved: 0 });
		expect(calls).toHaveLength(0);
	});
});
