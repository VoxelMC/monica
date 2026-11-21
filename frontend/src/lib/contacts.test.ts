import { describe, expect, it } from 'vitest';
import { allTags, matches, parseSort, relativeDate, searchContacts, sortContacts, type ContactCard } from './contacts';

const card = (o: Partial<ContactCard> & { id: number; name: string }): ContactCard => ({
	firstName: null,
	lastName: null,
	nickname: null,
	initials: 'X',
	color: '#000',
	hasPhoto: false,
	starred: false,
	tags: [],
	lastContacted: null,
	createdAt: '2026-01-01T00:00:00Z',
	phones: [],
	emails: [],
	...o
});

const zoe = card({ id: 1, name: 'Zoé Martin', firstName: 'Zoé', lastName: 'Martin', nickname: 'Zozo', phones: ['+1 (604) 555-0142'], emails: ['zoe@example.test'], tags: ['Climbing'], createdAt: '2026-03-01T00:00:00Z', lastContacted: '2026-10-01' });
const bob = card({ id: 2, name: 'Bob Stone', phones: ['604-555-9999'], tags: ['Work', 'Climbing'], createdAt: '2026-05-01T00:00:00Z' });
const ann = card({ id: 3, name: 'ann Lee', emails: ['ann@work.test'], createdAt: '2026-04-01T00:00:00Z', lastContacted: '2026-11-01' });
const all = [zoe, bob, ann];

describe('search', () => {
	it('matches name ignoring case and accents', () => {
		expect(matches(zoe, 'zoe')).toBe(true);
		expect(matches(zoe, 'MARTIN')).toBe(true);
	});
	it('matches nickname and email', () => {
		expect(matches(zoe, 'zozo')).toBe(true);
		expect(matches(ann, 'work.test')).toBe(true);
	});
	it('matches phone numbers ignoring formatting', () => {
		expect(matches(zoe, '5550142')).toBe(true);
		expect(matches(zoe, '555-0142')).toBe(true);
		expect(matches(zoe, '+1 604 555')).toBe(true);
		expect(matches(zoe, '(604) 555-0142')).toBe(true);
	});
	it('needs 3+ digits for phone matching and requires every term', () => {
		expect(matches(zoe, '01')).toBe(false);
		expect(matches(zoe, 'zoe 9999')).toBe(false);
		expect(matches(bob, 'bob 9999')).toBe(true);
	});
	it('does not phone-match mixed text like "a1b2c3"', () => {
		expect(matches(zoe, 'a604')).toBe(false);
	});
	it('empty query matches everyone; tag filter applies', () => {
		expect(searchContacts(all, '  ')).toHaveLength(3);
		expect(searchContacts(all, '', 'Climbing').map((c) => c.id)).toEqual([1, 2]);
		expect(searchContacts(all, '604', 'Work').map((c) => c.id)).toEqual([2]);
	});
});

describe('sort', () => {
	it('by name, case-insensitive', () => {
		expect(sortContacts(all, 'name').map((c) => c.id)).toEqual([3, 2, 1]);
	});
	it('by recently added', () => {
		expect(sortContacts(all, 'recent').map((c) => c.id)).toEqual([2, 3, 1]);
	});
	it('by last contacted, never-contacted last', () => {
		expect(sortContacts(all, 'last-contacted').map((c) => c.id)).toEqual([3, 1, 2]);
	});
	it('does not mutate the input', () => {
		const copy = [...all];
		sortContacts(all, 'name');
		expect(all).toEqual(copy);
	});
	it('parseSort falls back to name', () => {
		expect(parseSort('recent')).toBe('recent');
		expect(parseSort('bogus')).toBe('name');
		expect(parseSort(null)).toBe('name');
	});
});

describe('helpers', () => {
	it('allTags is unique and sorted', () => expect(allTags(all)).toEqual(['Climbing', 'Work']));
	it('relativeDate', () => {
		const now = new Date(2026, 10, 21, 15);
		expect(relativeDate('2026-11-21', now)).toBe('today');
		expect(relativeDate('2026-11-20', now)).toBe('yesterday');
		expect(relativeDate('2026-11-16', now)).toBe('5 days ago');
		expect(relativeDate('2026-12-03', now)).toBe('in 12 days');
		expect(relativeDate('2026-10-01', now)).toBe('7 weeks ago');
		expect(relativeDate('2026-05-21', now)).toBe('6 months ago');
		expect(relativeDate('2023-11-21', now)).toBe('3 years ago');
	});
});
