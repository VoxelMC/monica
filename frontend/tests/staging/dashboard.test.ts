// Slice 3 "done when" on STAGING (GET only): the birthday list matches Monica's yearly
// birthday reminders, which are what the phone calendar (CalDAV) shows.
import { loadEnv } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { birthdayInfo } from '../../src/lib/contact';
import { upcomingBirthdays } from '../../src/lib/dashboard';
import { assertDevTargetsStaging, parseMonicaUrl, parseToken } from '../../src/lib/server/config';
import { createMonicaClient, createTransport, type MonicaClient } from '../../src/lib/server/monica/client';
import { listContacts, listOpenTasks } from '../../src/lib/server/monica/contacts';
import { contactShort, reminder } from '../../src/lib/server/monica/schemas';

let client: MonicaClient;
beforeAll(() => {
	const env = loadEnv('development', process.cwd(), '');
	const baseUrl = parseMonicaUrl(env.MONICA_URL);
	assertDevTargetsStaging(baseUrl, true);
	client = createMonicaClient(createTransport({ baseUrl, token: parseToken(env.MONICA_TOKEN), readOnly: true, maxWaitMs: 120_000 }), { cacheTtlMs: 60_000 });
});

describe('slice 3 on staging', () => {
	it('upcoming birthdays match Monica birthday reminders (30-day window and whole year)', async () => {
		const contacts = await listContacts(client);
		const reminders = (await client.getAll('/api/reminders', reminder.extend({ contact: contactShort.nullable() }))).filter(
			(r) => r.frequency_type === 'year' && /birthday/i.test(r.title)
		);
		const ids = new Set(contacts.map((c) => c.id));
		const today = new Date();
		for (const days of [30, 366]) {
			const fromOrbit = upcomingBirthdays(contacts, today, days).map((b) => `${b.contact.id}:${b.info.nextIso}`).sort();
			const fromMonica = reminders
				.filter((r) => r.contact && ids.has(r.contact.id))
				.map((r) => {
					const [, m, d] = /^\d{4}-(\d{2})-(\d{2})/.exec(r.initial_date)!;
					return { id: r.contact!.id, info: birthdayInfo({ year: null, month: +m, day: +d, ageIsApprox: false }, today) };
				})
				.filter((r) => r.info.daysUntil <= days)
				.map((r) => `${r.id}:${r.info.nextIso}`)
				.sort();
			// Birthdays whose Monica reminder is orphaned (its contact was deleted, e.g. a merged
			// duplicate) can't be matched by contact id; match those by first name + date, and report them.
			const orphans = reminders.filter((r) => !r.contact);
			const unmatched = fromOrbit.filter((k) => !fromMonica.includes(k));
			const explained = unmatched.filter((k) => {
				const [id, iso] = k.split(':');
				const c = contacts.find((x) => x.id === Number(id))!;
				return orphans.some((r) => r.initial_date.slice(5, 10) === iso.slice(5, 10) && r.title.includes(c.firstName ?? c.name));
			});
			if (explained.length) console.warn(`[${days}d] birthdays whose Monica reminder is orphaned:`, explained);
			expect(unmatched.filter((k) => !explained.includes(k)), `window ${days} days: in orbit, not in Monica`).toEqual([]);
			expect(fromMonica.filter((k) => !fromOrbit.includes(k)), `window ${days} days: in Monica, not in orbit`).toEqual([]);
		}
	});

	it('open tasks load and validate', async () => {
		const tasks = await listOpenTasks(client);
		expect(Array.isArray(tasks)).toBe(true);
		const total = await client.get('/api/tasks', z.looseObject({ meta: z.looseObject({ total: z.number() }) }), { limit: 1, page: 1 });
		expect(tasks.length).toBeLessThanOrEqual(total.meta.total);
	});
});
