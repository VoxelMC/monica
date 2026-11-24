import { describe, expect, it } from 'vitest';
import type { ContactCard } from '../contacts';
import { catchupTarget, catchupTargets, describeDays, setCatchupTarget, withTargets } from './catchup';
import { memoryAudit } from './monica/test-helpers';

const fd = (days: string) => {
	const f = new FormData();
	f.set('days', days);
	return f;
};
const card = (id: number, stay: number | null): ContactCard => ({ id, name: 'P' + id, firstName: null, lastName: null, nickname: null, initials: 'P', color: '#000', hasPhoto: false, starred: false, tags: [], lastContacted: null, createdAt: 'x', phones: [], emails: [], stayInTouchDays: stay });

describe('catch-up targets', () => {
	it('set, change, clear; orbit wins over Monica, Monica is the fallback', () => {
		const { db } = memoryAudit();
		expect(setCatchupTarget(db, 7, fd('21'))).toEqual({ ok: true, message: 'Catch-up target set: every 3 weeks.' });
		expect(catchupTarget(db, 7)).toBe(21);
		setCatchupTarget(db, 7, fd('60'));
		expect(catchupTargets(db).get(7)).toBe(60);
		const merged = withTargets([card(7, 14), card(8, 30), card(9, null)], catchupTargets(db));
		expect(merged.map((c) => [c.stayInTouchDays, c.targetSource])).toEqual([[60, 'orbit'], [30, 'monica'], [null, null]]);
		expect(setCatchupTarget(db, 7, fd('')).message).toBe('Catch-up target cleared.');
		expect(catchupTarget(db, 7)).toBeNull();
		expect(withTargets([card(7, 14)], catchupTargets(db))[0]).toMatchObject({ stayInTouchDays: 14, targetSource: 'monica' });
	});
	it('the Clear button clears whatever days were sent', () => {
		const { db } = memoryAudit();
		setCatchupTarget(db, 7, fd('21'));
		const f = fd('21');
		f.set('clear', '1');
		expect(setCatchupTarget(db, 7, f).message).toBe('Catch-up target cleared.');
		expect(catchupTarget(db, 7)).toBeNull();
	});
	it('refuses junk', () => {
		const { db } = memoryAudit();
		expect(setCatchupTarget(db, 7, fd('-3')).ok).toBe(false);
		expect(setCatchupTarget(db, 7, fd('abc')).ok).toBe(false);
		expect(setCatchupTarget(db, 7, fd('99999')).ok).toBe(false);
	});
	it('describes intervals', () => {
		expect([7, 14, 30, 90, 10, 1].map(describeDays)).toEqual(['week', '2 weeks', 'month', '3 months', '10 days', 'day']);
	});
});
