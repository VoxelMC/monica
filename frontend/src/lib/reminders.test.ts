import { describe, expect, it } from 'vitest';
import { checkReminder, formatDue, quickPicks, relativeDue, validTimeZone } from './reminders';

const now = new Date('2026-11-23T20:00:00Z'); // 12:00 at UTC-8
const tz = 'Etc/GMT+8'; // fixed UTC-8 (real zones change their rules)

describe('checkReminder', () => {
	const ok = { note: 'Ask about the exam', dueAt: '2026-11-23T23:40:00.000Z', timeZone: tz };
	it('accepts a future time with a real time zone', () => expect(checkReminder(ok, now)).toBeNull());
	it('refuses past, far-future, malformed times, long notes and bad zones', () => {
		expect(checkReminder({ ...ok, dueAt: '2026-11-23T19:00:00Z' }, now)).toMatch(/passed/);
		expect(checkReminder({ ...ok, dueAt: '2029-01-01T00:00:00Z' }, now)).toMatch(/two years/);
		expect(checkReminder({ ...ok, dueAt: '2026-11-23 23:40' }, now)).toMatch(/Pick a time/);
		expect(checkReminder({ ...ok, dueAt: '' }, now)).toMatch(/Pick a time/);
		expect(checkReminder({ ...ok, note: 'x'.repeat(501) }, now)).toMatch(/too long/);
		expect(checkReminder({ ...ok, timeZone: 'Mars/Olympus' }, now)).toMatch(/time zone/);
	});
	it('allows a few minutes of lag for a slow submit', () => expect(checkReminder({ ...ok, dueAt: '2026-11-23T19:57:00Z' }, now)).toBeNull());
	it('validTimeZone', () => {
		expect(validTimeZone('Europe/Paris')).toBe(true);
		expect(validTimeZone('')).toBe(false);
	});
});

describe('formatDue (in the reminder’s zone, not the server’s)', () => {
	it('today, tomorrow, later', () => {
		expect(formatDue('2026-11-23T23:40:00Z', tz, now)).toBe('Today 15:40');
		expect(formatDue('2026-11-24T17:00:00Z', tz, now)).toBe('Tomorrow 09:00');
		expect(formatDue('2026-11-27T23:40:00Z', tz, now)).toBe('Fri 27 Nov, 15:40');
		expect(formatDue('2026-11-23T19:00:00Z', tz, now)).toBe('Today 11:00');
	});
	it('a UTC date that is still "today" at UTC-8', () => expect(formatDue('2026-11-24T07:30:00Z', tz, now)).toBe('Today 23:30'));
});

describe('relativeDue', () => {
	it('words', () => {
		expect(relativeDue('2026-11-23T20:30:00Z', now)).toBe('in 30 min');
		expect(relativeDue('2026-11-23T22:05:00Z', now)).toBe('in 2 h 5 min');
		expect(relativeDue('2026-11-26T20:00:00Z', now)).toBe('in 3 days');
		expect(relativeDue('2026-11-23T19:55:00Z', now)).toBe('5 min ago');
	});
});

describe('quickPicks', () => {
	it('offers the evening only before 18:00 local, always tomorrow morning', () => {
		const morning = new Date(2026, 10, 23, 10, 0);
		expect(quickPicks(morning).map((p) => p.label)).toEqual(['In 1 hour', 'In 3 hours', 'This evening', 'Tomorrow morning']);
		const late = new Date(2026, 10, 23, 21, 0);
		const picks = quickPicks(late);
		expect(picks.map((p) => p.label)).toEqual(['In 1 hour', 'In 3 hours', 'Tomorrow morning']);
		expect(picks[2].at.getHours()).toBe(9);
		expect(picks[2].at.getDate()).toBe(24);
	});
});
