import { describe, expect, it } from 'vitest';
import type { ContactCard } from '../contacts';
import { groupStats } from '../groups';
import { createGroup, deleteGroup, groupsFor, listGroups, renameGroup, setMembers } from './groups';
import { memoryAudit } from './monica/test-helpers';

const fd = (o: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
	return f;
};
const known = new Set([1, 2, 3, 4]);

describe('groups store', () => {
	it('create, rename, change members, delete (with confirmation)', () => {
		const { db } = memoryAudit();
		const r = createGroup(db, fd({ name: ' Climbing  crew ', member: ['1', '2', '2'] }), known);
		expect(r).toMatchObject({ ok: true, message: 'Created “Climbing crew” with 2 people.' });
		expect(listGroups(db)).toEqual([{ id: r.id, name: 'Climbing crew', members: [1, 2] }]);
		expect(createGroup(db, fd({ name: 'climbing crew' }), known).ok).toBe(false); // duplicate name
		expect(renameGroup(db, r.id!, fd({ name: 'Crag crew' })).ok).toBe(true);
		expect(setMembers(db, r.id!, fd({ member: ['2', '3', '4'] }), known)).toMatchObject({ ok: true, message: 'Saved: 3 people in the group.' });
		expect(groupsFor(db, 1)).toEqual([]);
		expect(groupsFor(db, 3).map((g) => g.name)).toEqual(['Crag crew']);
		expect(deleteGroup(db, r.id!, fd({})).ok).toBe(false);
		expect(deleteGroup(db, r.id!, fd({ confirm: 'yes' })).ok).toBe(true);
		expect(listGroups(db)).toEqual([]);
		expect(groupsFor(db, 3)).toEqual([]); // members went with it
	});
	it('refuses unknown people and empty names', () => {
		const { db } = memoryAudit();
		expect(createGroup(db, fd({ name: 'X', member: ['9'] }), known).ok).toBe(false);
		expect(createGroup(db, fd({ name: ' ' }), known).ok).toBe(false);
		expect(listGroups(db)).toEqual([]);
	});
});

describe('groupStats', () => {
	const card = (id: number, last: string | null, target: number | null = null): ContactCard => ({ id, name: 'P' + id, firstName: null, lastName: null, nickname: null, initials: 'P', color: '#000', hasPhoto: false, starred: false, tags: [], lastContacted: last, createdAt: 'x', phones: [], emails: [], stayInTouchDays: target });
	const today = new Date('2026-11-24T12:00:00Z');
	const cards = [card(1, '2026-11-20', 14), card(2, '2026-09-01', 30), card(3, null, 21), card(5, '2026-11-23')];
	const hangouts = [
		{ id: 10, date: '2026-11-20', title: 'Dinner with 1 and 5', people: [1, 5] }, // only one member
		{ id: 11, date: '2026-09-01', title: 'Bouldering', people: [1, 2] },
		{ id: 12, date: '2025-06-01', title: 'Old trip', people: [1, 2, 3] }
	];
	it('last time together needs two members; counts the last year; overdue first', () => {
		const s = groupStats([1, 2, 3], cards, hangouts, today);
		expect(s.lastTogether).toEqual({ id: 11, date: '2026-09-01', title: 'Bouldering', who: 2 });
		expect(s.hangoutsThisYear).toBe(1);
		expect(s.members.map((m) => [m.card.id, m.daysSince, m.overdueBy])).toEqual([
			[2, 84, 54],
			[3, null, 21],
			[1, 4, null]
		]);
	});
	it('a group of one counts hangouts with that person', () => {
		expect(groupStats([5], cards, hangouts, today).lastTogether?.id).toBe(10);
		expect(groupStats([], cards, hangouts, today).lastTogether).toBeNull();
	});
});
