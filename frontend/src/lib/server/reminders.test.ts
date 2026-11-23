import { describe, expect, it } from 'vitest';
import { parseNtfyUrl, sendNtfy } from './ntfy';
import { tick } from './reminder-loop';
import { createReminder, deleteReminder, dueToSend, markDone, notificationFor, openReminders, retryDelayMs, snooze } from './reminders';
import { memoryAudit } from './monica/test-helpers';

const now = new Date('2026-11-23T20:00:00Z');
const fd = (o: Record<string, string | number>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, String(v));
	return f;
};
const names = async (id: number) => (id === 7 ? 'Aeon Setien' : null);
const form = { contactId: 7, note: ' Ask how the exam went ', dueAt: '2026-11-23T23:40:00.000Z', timeZone: 'Etc/GMT+8' };

describe('reminders store', () => {
	it('creates, lists, snoozes, completes and deletes', async () => {
		const { db } = memoryAudit();
		const r = await createReminder(db, fd(form), names, now);
		expect(r).toMatchObject({ ok: true, message: 'Reminder set for Today 15:40.' });
		const [row] = openReminders(db, 7);
		expect(row).toMatchObject({ contactName: 'Aeon Setien', note: 'Ask how the exam went', sentAt: null, doneAt: null });
		expect(openReminders(db, 8)).toEqual([]);

		expect(snooze(db, fd({ id: row.id, minutes: 60 }), now)).toMatchObject({ ok: true, message: 'Moved to Today 13:00.' });
		expect(openReminders(db)[0].dueAt).toBe('2026-11-23T21:00:00.000Z');

		expect(markDone(db, fd({ id: row.id }), now).ok).toBe(true);
		expect(openReminders(db)).toEqual([]);
		expect(markDone(db, fd({ id: row.id }), now).ok).toBe(false); // already done
		expect(deleteReminder(db, fd({ id: row.id })).ok).toBe(true);
		expect(deleteReminder(db, fd({ id: row.id })).ok).toBe(false);
	});

	it('refuses unknown contacts, past times and junk', async () => {
		const { db } = memoryAudit();
		expect(await createReminder(db, fd({ ...form, contactId: 9 }), names, now)).toMatchObject({ ok: false, message: /not in Monica/ });
		expect(await createReminder(db, fd({ ...form, dueAt: '2026-11-22T10:00:00Z' }), names, now)).toMatchObject({ ok: false });
		expect(await createReminder(db, fd({ contactId: 'x' } as never), names, now)).toMatchObject({ ok: false });
		expect(snooze(db, fd({ id: 999, minutes: 10 }), now).ok).toBe(false);
		expect(openReminders(db)).toEqual([]);
	});
});

describe('sending', () => {
	async function withDue() {
		const { db } = memoryAudit();
		await createReminder(db, fd({ ...form, dueAt: '2026-11-23T20:10:00.000Z' }), names, now);
		return db;
	}
	const at = (iso: string) => () => new Date(iso);

	it('sends once when due, with a link to the contact', async () => {
		const db = await withDue();
		const sent: unknown[] = [];
		const send = async (n: unknown) => void sent.push(n);
		expect(await tick({ db: () => db, send, publicUrl: 'https://orbit.example', now: at('2026-11-23T20:05:00Z') })).toBe(0); // not yet
		expect(await tick({ db: () => db, send, publicUrl: 'https://orbit.example', now: at('2026-11-23T20:10:30Z') })).toBe(1);
		expect(await tick({ db: () => db, send, publicUrl: 'https://orbit.example', now: at('2026-11-23T20:11:00Z') })).toBe(0); // never twice
		expect(sent).toEqual([{ title: 'Aeon Setien', message: 'Ask how the exam went', click: 'https://orbit.example/contacts/7', tags: ['bell'] }]);
		expect(openReminders(db)[0].sentAt).toBe('2026-11-23T20:10:30.000Z'); // stays open until marked done
	});

	it('retries failures with growing pauses, and marks late ones', async () => {
		const db = await withDue();
		let fail = true;
		const sent: { message: string }[] = [];
		const send = async (n: { message: string }) => {
			if (fail) throw new Error('ntfy answered 502');
			sent.push(n);
		};
		await tick({ db: () => db, send, now: at('2026-11-23T20:10:00Z') });
		expect(openReminders(db)[0]).toMatchObject({ attempts: 1, lastError: 'ntfy answered 502', sentAt: null });
		expect(dueToSend(db, new Date('2026-11-23T20:10:30Z'))).toHaveLength(0); // waiting 1 min
		fail = false;
		await tick({ db: () => db, send, now: at('2026-11-23T20:40:00Z') });
		expect(sent[0].message).toBe('Ask how the exam went (late: was due Today 12:10)');
		expect(retryDelayMs(1)).toBe(60_000);
		expect(retryDelayMs(10)).toBe(3_600_000);
	});

	it('without ntfy configured nothing is sent and reminders wait', async () => {
		const db = await withDue();
		expect(await tick({ db: () => db, send: null, now: at('2026-11-23T21:00:00Z') })).toBe(0);
		expect(openReminders(db)[0].attempts).toBe(0);
	});

	it('done or snoozed reminders are not sent', async () => {
		const db = await withDue();
		const id = openReminders(db)[0].id;
		snooze(db, fd({ id, minutes: 120 }), now);
		expect(dueToSend(db, new Date('2026-11-23T20:30:00Z'))).toHaveLength(0);
		markDone(db, fd({ id }), now);
		expect(dueToSend(db, new Date('2026-11-24T20:30:00Z'))).toHaveLength(0);
	});

	it('the notification falls back to the name when there is no note', () => {
		const n = notificationFor({ contactName: 'Aeon', note: '', dueAt: '2026-11-23T20:00:00Z', timeZone: 'UTC', monicaContactId: 7 } as never, undefined, now);
		expect(n).toMatchObject({ title: 'Aeon', message: 'Reminder about Aeon', click: undefined });
	});
});

describe('ntfy', () => {
	it('parses the topic URL strictly', () => {
		expect(parseNtfyUrl('https://ntfy.sh/orbit-abc_1')).toEqual({ server: 'https://ntfy.sh', topic: 'orbit-abc_1' });
		expect(parseNtfyUrl('')).toBeUndefined();
		expect(() => parseNtfyUrl('https://ntfy.sh/')).toThrow(/topic/);
		expect(() => parseNtfyUrl('https://ntfy.sh/a/b')).toThrow(/topic/);
		expect(() => parseNtfyUrl('https://u:p@ntfy.sh/a')).toThrow();
		expect(() => parseNtfyUrl('ftp://ntfy.sh/a')).toThrow();
	});
	it('publishes JSON (accents survive) with the token as a bearer header', async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const f = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response('{}'))) as unknown as typeof fetch;
		await sendNtfy({ server: 'https://ntfy.sh', topic: 't', token: 'tk' }, { title: 'Raphaëlle', message: 'Hi' }, f);
		expect(calls[0].url).toBe('https://ntfy.sh/');
		expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ topic: 't', title: 'Raphaëlle', message: 'Hi', priority: 4 });
		expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tk');
		const bad = (async () => new Response('', { status: 403 })) as unknown as typeof fetch;
		await expect(sendNtfy({ server: 'https://ntfy.sh', topic: 't' }, { title: 'a', message: 'b' }, bad)).rejects.toThrow(/403/);
	});
});

describe('Monica unreachable while checking the contact', () => {
	it('says so instead of claiming the contact is gone', async () => {
		const { db } = memoryAudit();
		const r = await createReminder(db, fd(form), async () => { throw new Error('busy'); }, now);
		expect(r).toMatchObject({ ok: false, message: /could not be reached/ });
	});
});
