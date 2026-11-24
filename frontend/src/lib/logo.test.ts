import { describe, expect, it } from 'vitest';
import { faviconHref, faviconSvg } from './logo';
import { themeById } from './themes';

describe('favicon follows the chosen theme', () => {
	const ever = themeById('everforest-light')?.tokens ?? themeById('orbit-paper')!.tokens;
	it('light mode: the light theme’s text and accent colours only', () => {
		const svg = faviconSvg({ mode: 'light', light: 'orbit-paper', dark: 'orbit-ink' });
		expect(svg).toContain(`stroke:${themeById('orbit-paper')!.tokens.fg}`);
		expect(svg).toContain(`fill:${themeById('orbit-paper')!.tokens.accent}`);
		expect(svg).not.toContain('prefers-color-scheme');
	});
	it('dark mode uses the dark theme; system carries both', () => {
		const ink = themeById('orbit-ink')!.tokens;
		expect(faviconSvg({ mode: 'dark', light: 'orbit-paper', dark: 'orbit-ink' })).toContain(`fill:${ink.accent}`);
		const sys = faviconSvg({ mode: 'system', light: 'orbit-paper', dark: 'orbit-ink' });
		expect(sys).toContain('prefers-color-scheme:dark');
		expect(sys).toContain(`fill:${ink.accent}`);
	});
	it('another theme changes the colours; unknown ids fall back', () => {
		expect(faviconSvg({ mode: 'light', light: 'everforest-light', dark: 'orbit-ink' })).toContain(`fill:${ever.accent}`);
		expect(faviconSvg({ mode: 'light', light: 'nope', dark: 'nope' })).toContain(`fill:${themeById('orbit-paper')!.tokens.accent}`);
		expect(faviconHref({ mode: 'light', light: 'orbit-paper', dark: 'orbit-ink' })).toMatch(/^data:image\/svg\+xml,%3Csvg/);
	});
});
