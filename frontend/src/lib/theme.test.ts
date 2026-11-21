// Guards colour contrast (WCAG 2.2): text >= 4.5:1, controls and icons >= 3:1,
// in light and dark. Reads the tokens straight from src/app.css.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../app.css'), 'utf8');

function block(selector: string): Record<string, string> {
	const start = css.indexOf(selector + ' {');
	if (start < 0) throw new Error(`no ${selector} block in app.css`);
	const body = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const TEXT: [string, string][] = [
	['fg', 'bg'], ['fg', 'surface'], ['fg', 'surface-2'],
	['muted', 'bg'], ['muted', 'surface'], ['muted', 'surface-2'],
	['accent', 'bg'], ['accent', 'surface'], ['accent', 'surface-2'],
	['on-accent', 'accent-solid'],
	['on-accent-soft', 'accent-soft'],
	['fg', 'accent-soft'],
	['attention', 'bg'], ['attention', 'surface']
];
const CONTROLS: [string, string][] = [
	['control', 'bg'], ['control', 'surface'],
	['accent-solid', 'surface'], ['accent-solid', 'bg'],
	['dot-note', 'surface'], ['dot-activity', 'surface'], ['dot-call', 'surface'], ['dot-conversation', 'surface']
];

const light = block(':root');
const dark = block(":root[data-theme='dark']");
const darkMedia = block(":root:not([data-theme='light'])");

describe.each([['light', light], ['dark', dark]] as const)('%s theme', (_, t) => {
	it.each(TEXT)('text %s on %s >= 4.5:1', (fg, bg) => {
		expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
	});
	it.each(CONTROLS)('control %s on %s >= 3:1', (fg, bg) => {
		expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
	});
});

it('the system-dark block matches the data-theme=dark block', () => {
	expect(darkMedia).toEqual(dark);
});

it('both themes define the same tokens', () => {
	expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});
