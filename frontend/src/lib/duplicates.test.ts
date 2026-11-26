import { describe, expect, it } from 'vitest';
import { duplicateGroups, fieldKey, mergeLeftovers, nameKey, planMerge } from './duplicates';

const stats = { number_of_calls: 0, number_of_notes: 0, number_of_activities: 0, number_of_reminders: 0, number_of_tasks: 0, number_of_gifts: 0, number_of_debts: 0 };
const field = (type: string, content: string, id = type === 'phone' ? 2 : 1) => ({ content, contact_field_type: { id, type } });
const p = (id: number, extra: Record<string, unknown> = {}) => ({
	id,
	is_partial: false,
	is_active: true,
	tags: [],
	contactFields: [],
	addresses: [],
	statistics: stats,
	information: { avatar: { source: 'default' }, dates: { birthdate: { date: null } }, relationships: {}, career: {}, how_you_met: {} },
	...extra
});
const lists = { pets: [], conversations: [], documents: [], photos: [], reminders: [] };

describe('finding duplicates', () => {
	it('matches names ignoring case and spacing; skips empty names', () => {
		expect(nameKey(' Kayla ', null, 'Preocanin')).toBe(nameKey('kayla', '', 'PREOCANIN'));
		const g = duplicateGroups([
			{ id: 3, nameKey: 'kayla preocanin' },
			{ id: 1, nameKey: 'kayla preocanin' },
			{ id: 2, nameKey: 'kay mantel' },
			{ id: 4, nameKey: '' },
			{ id: 5, nameKey: '' }
		]);
		expect(g.map((x) => x.map((y) => y.id))).toEqual([[1, 3]]);
	});
	it('phones compare on their last 9 digits; emails without case', () => {
		expect(fieldKey('phone', '+1 (604) 555-0101')).toBe(fieldKey('phone', '604 555 0101'));
		expect(fieldKey('email', 'A@B.test ')).toBe(fieldKey('email', 'a@b.test'));
	});
});

describe('planMerge', () => {
	it('adds only tags, phones and emails the person kept lacks; a phone in another format is the same', () => {
		const keep = p(1, { tags: [{ name: 'Van' }], contactFields: [field('phone', '+1 604-555-0199')] });
		const copy = p(2, { tags: [{ name: 'van' }, { name: 'OG' }], contactFields: [field('phone', '604 555 0199'), field('email', 'k@example.test')], information: { ...p(2).information, avatar: { source: 'photo' } } });
		const plan = planMerge(keep, copy);
		expect(plan).toMatchObject({ tags: ['OG'], fields: [{ type: 'email', content: 'k@example.test' }], birthday: false, copyHasPhoto: true, blockers: [] });
	});
	it('moves a birthday only when the person kept has none; different birthdays block', () => {
		const bday = (date: string, extra = {}) => ({ ...p(0).information, dates: { birthdate: { date, is_age_based: false, ...extra } } });
		expect(planMerge(p(1), p(2, { information: bday('2000-08-13T00:00:00Z'), statistics: { ...stats, number_of_reminders: 1 } }))).toMatchObject({ birthday: true, blockers: [] });
		expect(planMerge(p(1, { information: bday('2000-08-03T00:00:00Z') }), p(2, { information: bday('2000-08-13T00:00:00Z') })).blockers[0]).toMatch(/different birthdays/);
		expect(planMerge(p(1), p(2, { information: bday('2000-08-13T00:00:00Z', { is_age_based: true }) })).blockers[0]).toMatch(/age-based/);
	});
	it('blocks what orbit cannot move', () => {
		const cases: [Record<string, unknown>, RegExp][] = [
			[{ statistics: { ...stats, number_of_notes: 1 } }, /1 note$/],
			[{ statistics: { ...stats, number_of_activities: 2 } }, /2 hangouts/],
			[{ statistics: { ...stats, number_of_reminders: 1 } }, /reminders/],
			[{ addresses: [{ id: 1 }] }, /addresses/],
			[{ contactFields: [field('Twitter', '@k', 9)] }, /cannot move/],
			[{ description: 'met at school' }, /description/],
			[{ nickname: 'KP' }, /nickname/],
			[{ is_me: true }, /you/],
			[{ information: { ...p(0).information, relationships: { friend: { total: 1 } } } }, /relationships/]
		];
		for (const [extra, re] of cases) expect(planMerge(p(1), p(2, extra)).blockers.join(' | ')).toMatch(re);
	});
});

describe('mergeLeftovers (checked again right before deleting)', () => {
	it('nothing left once everything is on the person kept', () => {
		const keep = p(1, { tags: [{ name: 'OG' }], contactFields: [field('email', 'k@example.test')] });
		const copy = p(2, { tags: [{ name: 'OG' }], contactFields: [field('email', 'K@example.test')], information: { ...p(2).information, avatar: { source: 'photo' } } });
		expect(mergeLeftovers(keep, copy, { ...lists, photos: [{ id: 1 }] })).toEqual([]);
	});
	it('lists what is still only on the copy', () => {
		const left = mergeLeftovers(p(1), p(2, { tags: [{ name: 'OG' }] }), { ...lists, pets: [{}], photos: [{ id: 1 }], reminders: [{ delible: true }] });
		expect(left.join(' | ')).toMatch(/tags not on the person kept yet: OG.*pets.*photos besides.*reminders/);
	});
});
