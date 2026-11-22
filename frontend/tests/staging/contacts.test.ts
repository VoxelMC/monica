// Slice 1 "done when" checks against STAGING Monica (GET only; transport is read-only).
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { searchContacts } from '../../src/lib/contacts';
import { assertDevTargetsStaging, parseMonicaUrl, parseToken } from '../../src/lib/server/config';
import { createMonicaClient, createTransport, type MonicaClient } from '../../src/lib/server/monica/client';
import { listContacts } from '../../src/lib/server/monica/contacts';
import { paginationMeta } from '../../src/lib/server/monica/schemas';

let client: MonicaClient;

beforeAll(() => {
	const env = loadEnv('development', process.cwd(), '');
	const baseUrl = parseMonicaUrl(env.MONICA_URL);
	assertDevTargetsStaging(baseUrl, true);
	client = createMonicaClient(createTransport({ baseUrl, token: parseToken(env.MONICA_TOKEN), readOnly: true, maxWaitMs: 120_000 }), { cacheTtlMs: 60_000 });
});

describe('slice 1 on staging', () => {
	it("list count matches Monica's total", async () => {
		const meta = await client.get('/api/contacts', z.looseObject({ meta: paginationMeta }), { limit: 1, page: 1 });
		const list = await listContacts(client);
		expect(list.length).toBe(meta.meta.total);
	});

	it('search finds every contact by (part of) each of its phone numbers', async () => {
		const list = await listContacts(client);
		const withPhones = list.filter((c) => c.phones.length);
		expect(withPhones.length).toBeGreaterThan(0);
		for (const c of withPhones) {
			for (const p of c.phones) {
				expect(searchContacts(list, p).map((x) => x.id)).toContain(c.id);
				const last4 = p.replace(/\D/g, '').slice(-4);
				if (last4.length === 4) expect(searchContacts(list, last4).map((x) => x.id)).toContain(c.id);
			}
		}
	});

	it('warm list load is under 1 s', async () => {
		await listContacts(client); // warm the cache
		const t = performance.now();
		await listContacts(client);
		expect(performance.now() - t).toBeLessThan(1000);
	});
});
