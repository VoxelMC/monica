import { describe, expect, it } from 'vitest';
import { memoryAudit } from './monica/test-helpers';
import { getTagColours, moveTagColour, setTagColour } from './tag-colours';
import { paintOf, tagColourKey } from '../tag-colours';
import { tagHue } from '../themes';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return f;
};

describe('tag colours', () => {
	it('theme colour, custom colour, clear; names fold case and spaces', () => {
		const { db } = memoryAudit();
		expect(setTagColour(db, fd({ name: 'Close  Friends', hue: '3' })).ok).toBe(true);
		expect(getTagColours(db)).toEqual({ 'close friends': { hue: 3, color: null } });
		expect(paintOf(' CLOSE friends', getTagColours(db)).dot).toBe('var(--hue-3)');
		setTagColour(db, fd({ name: 'close friends', color: '#FF8800' }));
		expect(getTagColours(db)).toEqual({ 'close friends': { hue: 0, color: '#ff8800' } });
		const p = paintOf('Close Friends', getTagColours(db));
		expect(p.dot).toBe('#ff8800');
		expect(p.bg).toContain('#ff8800');
		setTagColour(db, fd({ name: 'Close Friends', hue: '0' }));
		expect(getTagColours(db)).toEqual({});
		expect(paintOf('Close Friends', getTagColours(db)).dot).toBe(`var(--hue-${tagHue('Close Friends')})`);
	});
	it('refuses bad input', () => {
		const { db } = memoryAudit();
		expect(setTagColour(db, fd({ name: 'x', hue: '7' })).ok).toBe(false);
		expect(setTagColour(db, fd({ name: '  ', hue: '2' })).ok).toBe(false);
		expect(setTagColour(db, fd({ name: 'x', color: 'red; background:url(x)' })).ok).toBe(false);
		expect(getTagColours(db)).toEqual({});
	});
	it('a renamed tag keeps its colour', () => {
		const { db } = memoryAudit();
		setTagColour(db, fd({ name: 'Uni', color: '#123456' }));
		moveTagColour(db, 'Uni', 'UBC');
		expect(getTagColours(db)).toEqual({ ubc: { hue: 0, color: '#123456' } });
	});
	it('falls back to the automatic colour for unknown or bad values', () => {
		expect(paintOf('Work', undefined).dot).toBe(`var(--hue-${tagHue('Work')})`);
		expect(paintOf('Work', { [tagColourKey('Work')]: { hue: 9, color: 'nope' } }).dot).toBe(`var(--hue-${tagHue('Work')})`);
	});
});
