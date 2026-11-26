import { describe, expect, it } from 'vitest';
import { memoryAudit } from './monica/test-helpers';
import { getTagHues, moveTagColour, setTagColour } from './tag-colours';
import { hueOf, tagColourKey } from '../tag-colours';
import { tagHue } from '../themes';

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.append(k, v);
	return f;
};

describe('tag colours', () => {
	it('set, change, clear; names fold case and spaces', () => {
		const { db } = memoryAudit();
		expect(setTagColour(db, fd({ name: 'Close  Friends', hue: '3' })).ok).toBe(true);
		expect(getTagHues(db)).toEqual({ 'close friends': 3 });
		setTagColour(db, fd({ name: 'close friends', hue: '5' }));
		expect(getTagHues(db)).toEqual({ 'close friends': 5 });
		expect(hueOf(' CLOSE friends', getTagHues(db))).toBe(5);
		setTagColour(db, fd({ name: 'Close Friends', hue: '0' }));
		expect(getTagHues(db)).toEqual({});
		expect(hueOf('Close Friends', getTagHues(db))).toBe(tagHue('Close Friends'));
	});
	it('refuses bad input', () => {
		const { db } = memoryAudit();
		expect(setTagColour(db, fd({ name: 'x', hue: '7' })).ok).toBe(false);
		expect(setTagColour(db, fd({ name: '  ', hue: '2' })).ok).toBe(false);
		expect(getTagHues(db)).toEqual({});
	});
	it('a renamed tag keeps its colour', () => {
		const { db } = memoryAudit();
		setTagColour(db, fd({ name: 'Uni', hue: '2' }));
		moveTagColour(db, 'Uni', 'UBC');
		expect(getTagHues(db)).toEqual({ ubc: 2 });
		moveTagColour(db, 'nothing', 'else');
		expect(getTagHues(db)).toEqual({ ubc: 2 });
	});
	it('falls back to the automatic colour for unknown or bad values', () => {
		expect(hueOf('Work', undefined)).toBe(tagHue('Work'));
		expect(hueOf('Work', { [tagColourKey('Work')]: 9 })).toBe(tagHue('Work'));
	});
});
