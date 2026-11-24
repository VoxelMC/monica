import { describe, expect, it } from 'vitest';
import { addGiftIdea, setGiftStatus } from './gift-save';
import { createTransport } from './monica/client';
import { createGuards, WRITE_ALLOWLIST } from './monica/guards';
import { fakeClock, fakeFetch, memoryAudit } from './monica/test-helpers';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const GIFT = { data: { id: 3, name: 'Book', comment: null, url: null, amount: null, status: 'idea', date: null, recipient: null, contact: { id: 7 }, updated_at: 'T1' } };
function setup(replies: Parameters<typeof fakeFetch>[0] = () => ({ body: GIFT }), readOnly = false) {
	const f = fakeFetch(replies);
	const transport = createTransport({ baseUrl: 'http://127.0.0.1:8081', token: 't', readOnly, fetch: f.fetch, ...fakeClock() });
	return { ...f, guards: createGuards({ transport, readOnly, dryRun: false, audit: memoryAudit().audit, allowlist: WRITE_ALLOWLIST }) };
}

describe('addGiftIdea', () => {
	it('saves an idea; a bare domain link gets https://', async () => {
		const { guards, calls } = setup();
		expect(await addGiftIdea(guards, 7, fd({ name: ' Climbing shoes ', comment: '', url: 'shop.test/shoes' }))).toMatchObject({ ok: true });
		expect(calls[0].body).toEqual({ contact_id: 7, name: 'Climbing shoes', status: 'idea', comment: null, url: 'https://shop.test/shoes' });
	});
	it('refuses empty names and odd links before sending', async () => {
		const { guards, calls } = setup();
		expect((await addGiftIdea(guards, 7, fd({ name: ' ', comment: '', url: '' }))).ok).toBe(false);
		expect((await addGiftIdea(guards, 7, fd({ name: 'x', comment: '', url: 'not a link' }))).ok).toBe(false);
		expect(calls).toHaveLength(0);
	});
});

describe('setGiftStatus', () => {
	it('marks this contact’s gift given', async () => {
		const { guards, calls } = setup();
		expect(await setGiftStatus(guards, fd({ giftId: '3', status: 'offered', updatedAt: 'T1' }), [{ id: 3, name: 'Book' }])).toMatchObject({ ok: true, message: 'Marked “Book” given.' });
		expect(calls[1].body).toMatchObject({ status: 'offered', name: 'Book', contact_id: 7 });
	});
	it('refuses other contacts’ gifts; a priced gift says to use Monica', async () => {
		const { guards, calls } = setup();
		expect((await setGiftStatus(guards, fd({ giftId: '9', status: 'offered', updatedAt: 'T1' }), [{ id: 3, name: 'Book' }])).ok).toBe(false);
		expect(calls).toHaveLength(0);
		const priced = setup(() => ({ body: { data: { ...GIFT.data, amount: '20.00' } } }));
		expect((await setGiftStatus(priced.guards, fd({ giftId: '3', status: 'offered', updatedAt: 'T1' }), [{ id: 3, name: 'Book' }])).message).toMatch(/price.*Monica/);
	});
});
