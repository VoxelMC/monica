import { describe, expect, it } from 'vitest';
import type { ContactCard } from '../contacts';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';
import { saveTags } from './tags-save';

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
