// Read-only checks against STAGING Monica (pnpm test:staging). Sends GET requests only:
// the transport is created with readOnly: true, so any write would be refused locally.
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assertDevTargetsStaging, parseMonicaUrl, parseToken } from '../../src/lib/server/config';
import { createMonicaClient, createTransport, type MonicaClient } from '../../src/lib/server/monica/client';
import { contactSummary, paginationMeta, single, user } from '../../src/lib/server/monica/schemas';

let client: MonicaClient;

beforeAll(() => {
	const env = loadEnv('development', process.cwd(), '');
	const baseUrl = parseMonicaUrl(env.MONICA_URL);
	assertDevTargetsStaging(baseUrl, true); // never run these against anything but staging
	const transport = createTransport({ baseUrl, token: parseToken(env.MONICA_TOKEN), readOnly: true });
	client = createMonicaClient(transport, { cacheTtlMs: 0 });
});

describe('staging Monica (read-only)', () => {
	it('GET /api/me matches the user schema', async () => {
		const me = await client.get('/api/me', single(user));
		expect(me.data.object).toBe('user');
	});

	it('getAll(/api/contacts) returns exactly meta.total contacts', async () => {
		const first = await client.get('/api/contacts', z.looseObject({ meta: paginationMeta }), { limit: 1, page: 1 });
		const all = await client.getAll('/api/contacts', contactSummary);
		expect(all.length).toBe(first.meta.total);
		expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
	});

	it('pagination with a small page size gives the same contacts', async () => {
		const big = await client.getAll('/api/contacts', contactSummary);
		const small = await client.getAll('/api/contacts', contactSummary, { limit: 10 });
		expect(small.map((c) => c.id).sort()).toEqual(big.map((c) => c.id).sort());
	});
});
