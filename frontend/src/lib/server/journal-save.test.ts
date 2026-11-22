import { describe, expect, it } from 'vitest';
import { saveJournal, mentionsByEntry, entriesMentioning, forgetEntry } from './journal-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

function setup(opts: { readOnly?: boolean; dryRun?: boolean; replies?: Parameters<typeof fakeFetch>[0] } = {}) {
	const f = fakeFetch(opts.replies ?? [{ body: { data: { id: 5, object: 'entry' } } }]);
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly: opts.readOnly ?? false, fetch: f.fetch, ...fakeClock() });
	const { db, audit } = memoryAudit();
	return { ...f, db, guards: createGuards({ transport, readOnly: opts.readOnly ?? false, dryRun: opts.dryRun ?? false, audit, allowlist: WRITE_ALLOWLIST }) };
}
const known = new Set([1, 2, 3]);
const draft = {
	title: ' Whistler ',
	post: 'Drove up with @Ana Bernaz and @Bob Stone. Hiked.',
	mentions: [
		{ contactId: 1, name: 'Ana Bernaz' },
		{ contactId: 2, name: 'Bob Stone' },
		{ contactId: 3, name: 'Deleted From Text' }
	]
};

describe('saveJournal', () => {
	it('sends readable text to Monica and records the mentions in orbit', async () => {
		const { guards, db, calls } = setup();
		const r = await saveJournal(guards, db, draft, known);
		expect(r).toMatchObject({ ok: true, entryId: 5 });
		expect(calls[0].body).toEqual({ title: 'Whistler', post: 'Drove up with @Ana Bernaz and @Bob Stone. Hiked.' });
		expect(mentionsByEntry(db, [5]).get(5)).toEqual([
			{ contactId: 1, name: 'Ana Bernaz' },
			{ contactId: 2, name: 'Bob Stone' }
		]); // the mention no longer in the text is dropped
		expect(entriesMentioning(db, 2)).toEqual([5]);
		forgetEntry(db, 5);
		expect(entriesMentioning(db, 2)).toEqual([]);
	});
	it('read-only and dry run record no mentions', async () => {
		const ro = setup({ readOnly: true });
		expect((await saveJournal(ro.guards, ro.db, draft, known)).message).toMatch(/read-only/);
		expect(ro.calls).toHaveLength(0);
		expect(entriesMentioning(ro.db, 1)).toEqual([]);
		const dry = setup({ dryRun: true });
		expect((await saveJournal(dry.guards, dry.db, draft, known)).message).toMatch(/Dry run/);
		expect(dry.calls).toHaveLength(0);
		expect(entriesMentioning(dry.db, 1)).toEqual([]);
	});
	it('validates before sending: empty title or text, unknown people', async () => {
		const { guards, db, calls } = setup();
		expect((await saveJournal(guards, db, { ...draft, title: ' ' }, known)).ok).toBe(false);
		expect((await saveJournal(guards, db, { ...draft, post: '' }, known)).ok).toBe(false);
		expect((await saveJournal(guards, db, { ...draft, mentions: [{ contactId: 9, name: 'Ana Bernaz' }] }, known)).message).toMatch(/not in Monica/);
		expect(calls).toHaveLength(0);
	});
});
