import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMonicaClient, createTransport, retryAfterMs } from './client';
import { MonicaHttpError, MonicaRateLimitError, MonicaValidationError, WriteRefusedError } from './errors';
import { contactSummary, single, user } from './schemas';
import { fakeClock, fakeFetch, page } from './test-helpers';

const BASE = 'http://127.0.0.1:8081';
const TOKEN = 'test-token-not-real';

function setup(replies: Parameters<typeof fakeFetch>[0], extra: Partial<Parameters<typeof createTransport>[0]> = {}) {
	const f = fakeFetch(replies);
	const clock = fakeClock();
	const transport = createTransport({ baseUrl: BASE, token: TOKEN, readOnly: true, fetch: f.fetch, ...clock, ...extra });
	const client = createMonicaClient(transport, { now: clock.now });
	return { ...f, clock, transport, client };
}

const contact = (id: number) => ({
	id,
	object: 'contact',
	first_name: 'A',
	last_name: String(id),
	nickname: null,
	complete_name: `A ${id}`,
	initials: 'A',
	updated_at: '2026-11-21T00:00:00Z',
	extra_field: { kept: true }
});

const me = {
	data: {
		id: 1,
		object: 'user',
		first_name: 'T',
		last_name: 'F',
		name: 'T F',
		email: 't@example.test',
		timezone: 'Europe/Paris',
		locale: 'en',
		currency: { id: 1, object: 'currency', iso: 'CAD', name: 'Canadian Dollar', symbol: '$' },
		account: { id: 1 },
		created_at: 'x',
		updated_at: 'y'
	}
};

describe('requests', () => {
	it('sends the bearer token and JSON accept header to the configured origin', async () => {
		const { client, calls } = setup([{ body: me }]);
		const res = await client.get('/api/me', single(user));
		expect(res.data.name).toBe('T F');
		expect(calls[0].url).toBe(`${BASE}/api/me`);
		expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0].headers.Accept).toBe('application/json');
	});

	it('refuses absolute URLs and paths outside /api/', async () => {
		const { client, calls } = setup([]);
		for (const p of ['http://evil.example/api/me', '/api/../oauth', '/me', '//evil.example/api/me', '/api/me?x=1']) {
			await expect(client.get(p, z.unknown())).rejects.toBeInstanceOf(WriteRefusedError);
		}
		expect(calls).toHaveLength(0);
	});

	it('error messages do not contain the token', async () => {
		const { client } = setup([{ status: 500 }]);
		const err = (await client.get('/api/me', z.unknown()).catch((e: unknown) => e)) as Error;
		expect(err).toBeInstanceOf(MonicaHttpError);
		expect(String(err.message)).not.toContain(TOKEN);
	});
});

describe('pagination', () => {
	it('walks ?page= until meta.last_page and ignores links', async () => {
		const { client, calls } = setup([
			{ body: page([contact(1), contact(2)], 1, 3) },
			{ body: page([contact(3), contact(4)], 2, 3) },
			{ body: page([contact(5)], 3, 3) }
		]);
		const all = await client.getAll('/api/contacts', contactSummary);
		expect(all.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
		expect(calls.map((c) => new URL(c.url).searchParams.get('page'))).toEqual(['1', '2', '3']);
		for (const c of calls) {
			expect(new URL(c.url).origin).toBe(BASE);
			expect(new URL(c.url).searchParams.get('limit')).toBe('100');
		}
	});

	it('keeps unknown fields (no stripping)', async () => {
		const { client } = setup([{ body: page([contact(1)], 1, 1) }]);
		const [c] = await client.getAll('/api/contacts', contactSummary);
		expect((c as Record<string, unknown>).extra_field).toEqual({ kept: true });
	});

	it('passes extra query params through', async () => {
		const { client, calls } = setup([{ body: page([], 1, 1) }]);
		await client.getAll('/api/contacts', contactSummary, { query: 'bob', with: 'contactfields' });
		const q = new URL(calls[0].url).searchParams;
		expect(q.get('query')).toBe('bob');
		expect(q.get('with')).toBe('contactfields');
	});
});

describe('rate limiting', () => {
	it('honours 429 Retry-After and retries', async () => {
		const { client, calls, clock } = setup([
			{ status: 429, headers: { 'Retry-After': '7' } },
			{ body: me }
		]);
		await client.get('/api/me', single(user));
		expect(calls).toHaveLength(2);
		expect(clock.sleeps).toContain(7000);
	});

	it('gives up after maxRetries 429s', async () => {
		const { client, calls } = setup(() => ({ status: 429, headers: { 'Retry-After': '1' } }), { maxRetries: 2 });
		await expect(client.get('/api/me', z.unknown())).rejects.toBeInstanceOf(MonicaRateLimitError);
		expect(calls).toHaveLength(3);
	});

	it('fails fast instead of hanging when the minute budget is used up', async () => {
		const { transport, calls } = setup(() => ({ body: {} }), { requestsPerMinute: 2 });
		await transport.request('GET', '/api/genders');
		await transport.request('GET', '/api/genders');
		await expect(transport.request('GET', '/api/genders')).rejects.toBeInstanceOf(MonicaRateLimitError);
		expect(calls).toHaveLength(2);
	});

	it('does not wait out a long Retry-After', async () => {
		const { client, calls } = setup([{ status: 429, headers: { 'Retry-After': '45' } }, { body: me }]);
		await expect(client.get('/api/me', single(user))).rejects.toBeInstanceOf(MonicaRateLimitError);
		expect(calls).toHaveLength(1);
	});

	it('throttles to requestsPerMinute (when allowed to wait)', async () => {
		const { transport, clock } = setup(() => ({ body: {} }), { requestsPerMinute: 2, maxWaitMs: 120_000 });
		await Promise.all([1, 2, 3].map(() => transport.request('GET', '/api/genders')));
		expect(clock.sleeps.length).toBe(1);
		expect(clock.sleeps[0]).toBe(60_000);
	});

	it('parses Retry-After', () => {
		expect(retryAfterMs('3', 0)).toBe(3000);
		expect(retryAfterMs(null, 0)).toBe(60_000);
		expect(retryAfterMs('junk', 0)).toBe(60_000);
		expect(retryAfterMs('9999', 0)).toBe(120_000);
	});
});

describe('validation', () => {
	it('throws MonicaValidationError on unexpected shapes', async () => {
		const { client } = setup([{ body: { data: { id: 'not-a-number' } } }]);
		const err = await client.get('/api/me', single(user)).catch((e) => e);
		expect(err).toBeInstanceOf(MonicaValidationError);
		expect(err.message).toMatch(/data\.id/);
	});

	it('throws when a page is missing meta', async () => {
		const { client } = setup([{ body: { data: [] } }]);
		await expect(client.getAll('/api/contacts', contactSummary)).rejects.toBeInstanceOf(MonicaValidationError);
	});
});

describe('cache', () => {
	it('caches GETs briefly and invalidate() clears them', async () => {
		const { client, calls } = setup(() => ({ body: me }));
		await client.get('/api/me', single(user));
		await client.get('/api/me', single(user));
		expect(calls).toHaveLength(1);
		client.invalidate();
		await client.get('/api/me', single(user));
		expect(calls).toHaveLength(2);
	});

	it('does not cache failures', async () => {
		const { client, calls } = setup([{ status: 500 }, { body: me }]);
		await expect(client.get('/api/me', single(user))).rejects.toThrow();
		await client.get('/api/me', single(user));
		expect(calls).toHaveLength(2);
	});
});

describe('retries', () => {
	it('retries GET on network errors and 503', async () => {
		const { client, calls } = setup([new Error('ECONNRESET'), { status: 503 }, { body: me }]);
		await client.get('/api/me', single(user));
		expect(calls).toHaveLength(3);
	});

	it('never retries a write after a network error', async () => {
		const { transport, calls } = setup([new Error('ECONNRESET'), { body: {} }], { readOnly: false });
		await expect(transport.request('POST', '/api/notes', { body: {} })).rejects.toThrow(/Could not reach/);
		expect(calls).toHaveLength(1);
	});
});
