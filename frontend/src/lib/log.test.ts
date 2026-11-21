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

describe('per-person notes', () => {
	const d = { ...draft, contactIds: [1, 3], summary: 'Dinner', date: '2026-11-20', personNotes: { 1: '  Starting a new job in March ', 3: '  ', 9: 'not in hangout' } };
	it('one note per person with text, headed with the hangout', async () => {
		const { personNotePayloads } = await import('./log');
		expect(personNotePayloads(d)).toEqual([{ contact_id: 1, body: 'From: Dinner · 2026-11-20\n\nStarting a new job in March' }]);
	});
	it('none when there are no notes', async () => {
		const { personNotePayloads } = await import('./log');
		expect(personNotePayloads({ ...draft })).toEqual([]);
	});
});

describe('mentions', () => {
	it('finds the @-query at the caret, including one space for full names', async () => {
		const { mentionQuery } = await import('./log');
		expect(mentionQuery('Met @an', 7)).toEqual({ query: 'an', start: 4 });
		expect(mentionQuery('@ana be', 7)).toEqual({ query: 'ana be', start: 0 });
		expect(mentionQuery('Met @', 5)).toEqual({ query: '', start: 4 });
		expect(mentionQuery('email a@b', 9)).toBeNull();
		expect(mentionQuery('Met @ana bernaz again', 21)).toBeNull();
	});
	it('inserts the full name and moves the caret after it', async () => {
		const { insertMention } = await import('./log');
		expect(insertMention('Met @an today', 4, 7, 'Ana Bernaz')).toEqual({ text: 'Met @Ana Bernaz  today', caret: 16 });
	});
	it('drops mentions whose text was deleted, and duplicates', async () => {
		const { activeMentions } = await import('./log');
		const ms = [{ contactId: 1, name: 'Ana Bernaz' }, { contactId: 2, name: 'Bob Stone' }, { contactId: 1, name: 'Ana Bernaz' }];
		expect(activeMentions('Saw @Ana Bernaz at the park', ms)).toEqual([{ contactId: 1, name: 'Ana Bernaz' }]);
	});
});

describe('mention polish', () => {
	it('ranks names starting with the query first', async () => {
		const { rankForMention } = await import('./log');
		const { fold } = await import('./contacts');
		const list = [{ name: 'Kay Mantel', nickname: null }, { name: 'Anastasia Bernaz', nickname: 'Ana' }, { name: 'Jo Anders', nickname: null }];
		expect(rankForMention(list, 'an', fold).map((c) => c.name)).toEqual(['Anastasia Bernaz', 'Jo Anders', 'Kay Mantel']);
	});
	it('snaps punctuation onto the mention', async () => {
		const { snapPunctuation } = await import('./log');
		expect(snapPunctuation('with @Ana ', 10, '.', 10)).toEqual({ text: 'with @Ana.', caret: 10 });
		expect(snapPunctuation('with @Ana ', 10, 'x', 10)).toBeNull();
		expect(snapPunctuation('with @Ana ', 10, '.', null)).toBeNull();
	});
});
