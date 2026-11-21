// Slice 2 on STAGING (GET only): 10 sampled contacts load, validate, and agree with the list.
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertDevTargetsStaging, parseMonicaUrl, parseToken } from '../../src/lib/server/config';
import { createMonicaClient, createTransport, type MonicaClient } from '../../src/lib/server/monica/client';
import { loadContactPage } from '../../src/lib/server/monica/contact-page';
import { listContacts } from '../../src/lib/server/monica/contacts';

let client: MonicaClient;

beforeAll(() => {
	const env = loadEnv('development', process.cwd(), '');
	const baseUrl = parseMonicaUrl(env.MONICA_URL);
	assertDevTargetsStaging(baseUrl, true);
	client = createMonicaClient(createTransport({ baseUrl, token: parseToken(env.MONICA_TOKEN), readOnly: true }), { cacheTtlMs: 60_000 });
});

describe('slice 2 on staging', () => {
	it('10 sampled contacts load and match the list', async () => {
		const list = await listContacts(client);
		// Spread the sample across the list, preferring contacts with birthdays/notes first.
		const step = Math.max(1, Math.floor(list.length / 10));
		const sample = list.filter((_, i) => i % step === 0).slice(0, 10);
		for (const card of sample) {
			const p = await loadContactPage(client, card.id);
			expect(p.name).toBe(card.name);
			expect(p.nickname).toBe(card.nickname);
			expect(p.tags).toEqual(card.tags);
			expect(p.phones.map((f) => f.value)).toEqual(card.phones);
			expect(p.emails.map((f) => f.value)).toEqual(card.emails);
			for (const f of [...p.phones, ...p.emails, ...p.otherFields]) {
				if (f.href) expect(f.href).toMatch(/^(tel:|mailto:|https?:\/\/)/);
			}
		}
	});
});
