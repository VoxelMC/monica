import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, htmlAttrs, parsePrefs } from './prefs';

describe('prefs cookie', () => {
	it('falls back to defaults for missing, malformed or unknown values', () => {
		expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
		expect(parsePrefs('{not json')).toEqual(DEFAULT_PREFS);
		expect(parsePrefs(JSON.stringify({ mode: 'neon', light: 'catppuccin-mocha', font: '"><script>' }))).toEqual(DEFAULT_PREFS);
	});
	it('keeps valid choices', () => {
		const p = { mode: 'dark', light: 'everforest-light', dark: 'catppuccin-mocha', font: 'garamond', peopleView: 'lines' };
		expect(parsePrefs(JSON.stringify(p))).toEqual(p);
	});
	it('html attributes only ever contain known ids', () => {
		expect(htmlAttrs(parsePrefs('{"dark":"x\\" onload=\\"alert(1)"}'))).toBe('data-mode="system" data-light="orbit-paper" data-dark="orbit-ink" data-font="lora"');
	});
});
