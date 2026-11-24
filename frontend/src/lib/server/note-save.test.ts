import { describe, expect, it } from 'vitest';
import { addNote } from './note-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
function setup(readOnly = false) {
	const f = fakeFetch(() => ({ body: { data: { id: 5 } } }));
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
}

describe('addNote', () => {
	it('sends the trimmed text for that person only', async () => {
		const { guards, calls } = setup();
		expect(await addNote(guards, fd({ contactId: '7', body: '  Moving to Lyon in May \n' }))).toMatchObject({ ok: true, message: 'Note added.' });
		expect(calls[0]).toMatchObject({ method: 'POST', body: { contact_id: 7, body: 'Moving to Lyon in May' } });
		expect(new URL(calls[0].url).pathname).toBe('/api/notes');
	});
	it('refuses empty text and junk; read-only says so', async () => {
		const { guards, calls } = setup();
		expect((await addNote(guards, fd({ contactId: '7', body: '   ' }))).message).toMatch(/Write something/);
		expect((await addNote(guards, fd({ contactId: 'x', body: 'a' }))).ok).toBe(false);
		expect(calls).toHaveLength(0);
		const ro = setup(true);
		expect((await addNote(ro.guards, fd({ contactId: '7', body: 'a' }))).message).toMatch(/read-only/);
		expect(ro.calls).toHaveLength(0);
	});
});
