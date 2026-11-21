import { describe, expect, it } from 'vitest';
import type { ContactCard } from './contacts';
import { catchUpSoon, recentlyChanged, upcomingBirthdays } from './dashboard';

const card = (o: Partial<ContactCard> & { id: number; name: string }): ContactCard => ({
	firstName: null, lastName: null, nickname: null, initials: 'X', color: '#000', hasPhoto: false, starred: false,
	tags: [], lastContacted: null, createdAt: '2026-01-01T00:00:00Z', phones: [], emails: [], ...o
});
const today = new Date(2026, 10, 21); // Nov 21 2026

describe('upcomingBirthdays', () => {
	const list = [
		card({ id: 1, name: 'Dec 10', birthday: { year: 1990, month: 12, day: 10, ageIsApprox: false } }),
		card({ id: 2, name: 'Today', birthday: { year: null, month: 11, day: 21, ageIsApprox: false } }),
		card({ id: 3, name: 'Dec 21', birthday: { year: 2000, month: 12, day: 21, ageIsApprox: false } }),
		card({ id: 4, name: 'Dec 22', birthday: { year: 2000, month: 12, day: 22, ageIsApprox: false } }),
		card({ id: 5, name: 'None' })
	];
	it('includes today through 30 days ahead, soonest first', () => {
		expect(upcomingBirthdays(list, today).map((b) => [b.contact.id, b.info.daysUntil])).toEqual([[2, 0], [1, 19], [3, 30]]);
	});
	it('wraps around the new year', () => {
		const dec = new Date(2026, 11, 20);
		const jan = card({ id: 6, name: 'Jan 5', birthday: { year: 1995, month: 1, day: 5, ageIsApprox: false } });
		expect(upcomingBirthdays([jan], dec).map((b) => [b.info.daysUntil, b.info.nextAge])).toEqual([[16, 32]]);
	});
});

describe('catchUpSoon', () => {
	it('lists people past their target, most overdue first; never-contacted count as target days overdue', () => {
		const list = [
			card({ id: 1, name: 'A', stayInTouchDays: 14, lastContacted: '2026-11-01' }), // 20 days, 6 over
			card({ id: 2, name: 'B', stayInTouchDays: 30, lastContacted: '2026-11-10' }), // fine
			card({ id: 3, name: 'C', stayInTouchDays: 7 }), // never: 7
			card({ id: 4, name: 'D', lastContacted: '2020-01-01' }), // no target
			card({ id: 5, name: 'E', stayInTouchDays: 7, lastContacted: '2026-10-01T10:00:00Z' }) // 51 days, 44 over
		];
		expect(catchUpSoon(list, today).map((o) => [o.contact.id, o.overdueBy])).toEqual([[5, 44], [3, 7], [1, 6]]);
	});
});

describe('recentlyChanged', () => {
	it('newest first; tells added from updated', () => {
		const list = [
			card({ id: 1, name: 'Old', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:10Z' }),
			card({ id: 2, name: 'Edited', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-11-20T09:00:00Z' }),
			card({ id: 3, name: 'New', createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z' })
		];
		expect(recentlyChanged(list, 2).map((r) => [r.contact.id, r.kind])).toEqual([[2, 'updated'], [3, 'added']]);
	});
});
