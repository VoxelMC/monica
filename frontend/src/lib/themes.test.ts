// Every theme must stay readable: text >= 4.5:1, controls, dots and hues >= 3:1.
import { describe, expect, it } from 'vitest';
import { contrast, tagHue, THEMES, themeCss } from './themes';

const TEXT: [string, string][] = [
	['fg', 'bg'], ['fg', 'surface'], ['fg', 'surface-2'],
	['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
	['accent', 'bg'], ['accent', 'surface'], ['accent', 'surface-2'],
	['on-accent', 'accent-solid'], ['on-accent-soft', 'accent-soft'], ['fg', 'accent-soft'],
	['attention', 'bg'], ['attention', 'surface'],
	...[1, 2, 3, 4, 5, 6].map((i) => [`tag-${i}-fg`, `tag-${i}-bg`] as [string, string])
];
const CONTROLS: [string, string][] = [
	['control', 'bg'], ['control', 'surface'], ['accent-solid', 'surface'],
	...[1, 2, 3, 4, 5, 6].map((i) => [`hue-${i}`, 'surface'] as [string, string])
];

describe.each(THEMES.map((t) => [t.name, t] as const))('%s', (_, t) => {
	it.each(TEXT)('text %s on %s >= 4.5:1', (a, b) => expect(contrast(t.tokens[a], t.tokens[b])).toBeGreaterThanOrEqual(4.5));
	it.each(CONTROLS)('%s on %s >= 3:1', (a, b) => expect(contrast(t.tokens[a], t.tokens[b])).toBeGreaterThanOrEqual(3));
});

it('all themes define the same tokens', () => {
	const keys = Object.keys(THEMES[0].tokens).sort();
	for (const t of THEMES) expect(Object.keys(t.tokens).sort()).toEqual(keys);
});

it('theme CSS covers every theme', () => {
	const css = themeCss();
	for (const t of THEMES) expect(css).toContain(`=${t.id}]`);
});

it('tag colours are stable and spread', () => {
	expect(tagHue('Science')).toBe(tagHue('science'));
	const slots = new Set(['Science', 'Synbio', 'OG', 'Paris', 'Van', 'MG', 'Nambi', 'Discord'].map(tagHue));
	expect(slots.size).toBeGreaterThanOrEqual(4);
});
