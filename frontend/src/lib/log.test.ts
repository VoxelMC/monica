import { describe, expect, it } from 'vitest';
import { checkHangout, checkJournal, hangoutPayload, journalPayload, parsePeople, todayIso } from './log';

const draft = { contactIds: [3, 1, 3], summary: '  Dinner at Ana’s ', description: '', date: '2026-11-20', activityTypeId: null };

describe('hangouts', () => {
	it('builds the Monica payload: trimmed, deduplicated, optional fields left out', () => {
		expect(hangoutPayload(draft)).toEqual({ summary: 'Dinner at Ana’s', happened_at: '2026-11-20', contacts: [3, 1] });
		expect(hangoutPayload({ ...draft, description: ' Tacos ', activityTypeId: 9 })).toEqual({
			summary: 'Dinner at Ana’s',
			description: 'Tacos',
			happened_at: '2026-11-20',
			activity_type_id: 9,
			contacts: [3, 1]
		});
	});

	it('validates people, summary and date', () => {
		expect(checkHangout(draft, '2026-11-21')).toEqual({});
		const p = checkHangout({ ...draft, contactIds: [], summary: ' ', date: '2026-13-40' }, '2026-11-21');
		expect(Object.keys(p).sort()).toEqual(['date', 'people', 'summary']);
		expect(checkHangout({ ...draft, date: '2026-11-22' }, '2026-11-21').date).toMatch(/future/);
		expect(checkHangout({ ...draft, summary: 'x'.repeat(256) }, '2026-11-21').summary).toMatch(/255/);
	});
});

describe('journal', () => {
	it('builds and validates', () => {
		expect(journalPayload({ title: ' Trip ', post: ' Lisbon ' })).toEqual({ title: 'Trip', post: 'Lisbon' });
		expect(checkJournal({ title: '', post: '' })).toEqual({ title: expect.any(String), post: expect.any(String) });
	});
});

describe('helpers', () => {
	it('parsePeople', () => {
		expect(parsePeople('1,2,2,abc,-3,0,4')).toEqual([1, 2, 4]);
		expect(parsePeople(null)).toEqual([]);
	});
	it('todayIso uses local date', () => expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05'));
});
