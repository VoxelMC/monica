import { describe, expect, it } from 'vitest';
import { birthdayInfo, fieldHref, mapHref, parseBirthday, safeHttpUrl, sortTimeline, type TimelineItem } from './contact';

const today = new Date(2026, 10, 21); // Nov 21 2026

describe('birthdays', () => {
	it('parses the calendar date without timezone shifts', () => {
		expect(parseBirthday({ date: '2001-03-11T00:00:00Z', is_year_unknown: false })).toEqual({ year: 2001, month: 3, day: 11, ageIsApprox: false });
		expect(parseBirthday({ date: null })).toBeNull();
		expect(parseBirthday(null)).toBeNull();
	});

	it('computes age, next age and days until', () => {
		const b = birthdayInfo(parseBirthday({ date: '2001-03-11T00:00:00Z' })!, today);
		expect(b).toMatchObject({ label: 'March 11, 2001', age: 25, nextAge: 26, daysUntil: 110, nextIso: '2027-03-11' });
	});

	it('handles today and tomorrow', () => {
		expect(birthdayInfo(parseBirthday({ date: '1990-11-21T00:00:00Z' })!, today)).toMatchObject({ daysUntil: 0, age: 36, nextAge: 36 });
		expect(birthdayInfo(parseBirthday({ date: '1990-11-22T00:00:00Z' })!, today)).toMatchObject({ daysUntil: 1, age: 35, nextAge: 36 });
	});

	it('hides the year and age when the year is unknown', () => {
		const b = birthdayInfo(parseBirthday({ date: '2026-02-19T00:00:00Z', is_year_unknown: true })!, today);
		expect(b).toMatchObject({ label: 'February 19', age: null, nextAge: null, nextIso: '2027-02-19' });
	});

	it('marks age-based birthdays as approximate', () => {
		const b = birthdayInfo(parseBirthday({ date: '1980-01-01T00:00:00Z', is_age_based: true })!, today);
		expect(b.ageIsApprox).toBe(true);
		expect(b.label).toBe('January 1');
	});

	it('Feb 29 falls on Feb 28 in non-leap years', () => {
		expect(birthdayInfo(parseBirthday({ date: '2000-02-29T00:00:00Z' })!, today).nextIso).toBe('2027-02-28');
		expect(birthdayInfo(parseBirthday({ date: '2000-02-29T00:00:00Z' })!, new Date(2027, 11, 1)).nextIso).toBe('2028-02-29');
	});
});

describe('timeline', () => {
	it('sorts newest first across kinds', () => {
		const items: TimelineItem[] = [
			{ kind: 'note', id: 1, date: '2026-01-05T10:00:00Z', title: 'n', body: null },
			{ kind: 'activity', id: 2, date: '2026-03-01', title: 'a', body: null },
			{ kind: 'call', id: 3, date: '2026-02-10T08:00:00Z', title: 'c', body: null }
		];
		expect(sortTimeline(items).map((i) => i.id)).toEqual([2, 3, 1]);
	});
});

describe('links', () => {
	it('builds tel and mailto links', () => {
		expect(fieldHref('phone', 'tel:', '+1 (604) 555-0142')).toBe('tel:+16045550142');
		expect(fieldHref('email', 'mailto:', 'a@example.test')).toBe('mailto:a@example.test');
		expect(fieldHref('email', 'mailto:', 'not an email')).toBeNull();
	});

	it('never links dangerous or unknown protocols', () => {
		expect(fieldHref(null, 'javascript:', 'alert(1)')).toBeNull();
		expect(fieldHref(null, 'data:', 'text/html,x')).toBeNull();
		expect(fieldHref(null, null, 'javascript:alert(1)')).toBeNull();
		expect(fieldHref(null, null, 'me#1234')).toBeNull();
		expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
	});

	it('links http(s) values and protocols', () => {
		expect(fieldHref(null, 'https:', 'example.test/me')).toBe('https://example.test/me');
		expect(fieldHref(null, null, 'https://example.test/x')).toBe('https://example.test/x');
	});

	it('map link encodes the address', () => {
		expect(mapHref(['1 Main St', null, 'Vancouver', ''])).toBe('https://www.openstreetmap.org/search?query=1%20Main%20St%2C%20Vancouver');
		expect(mapHref([null, ' '])).toBeNull();
	});
});
