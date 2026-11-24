// The browser-tab icon in the colours of the theme picked in Settings (2026-11-24).
// "system" mode carries both the light and the dark theme, switched by the device.
import type { Prefs } from './prefs';
import { DEFAULT_DARK, DEFAULT_LIGHT, themeById } from './themes';

const RING = 'M53.60 27.80 A22 22 0 1 1 33.53 10.05';

function colours(id: string, fallback: string) {
	const t = themeById(id) ?? themeById(fallback)!;
	return { ring: t.tokens.fg, sat: t.tokens.accent };
}

/** SVG markup of the favicon for these preferences. */
export function faviconSvg(prefs: Pick<Prefs, 'mode' | 'light' | 'dark'>): string {
	const light = colours(prefs.light, DEFAULT_LIGHT);
	const dark = colours(prefs.dark, DEFAULT_DARK);
	const base = prefs.mode === 'dark' ? dark : light;
	const media = prefs.mode === 'system' ? `@media (prefers-color-scheme:dark){.o{stroke:${dark.ring}}.s{fill:${dark.sat}}}` : '';
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.o{stroke:${base.ring}}.s{fill:${base.sat}}${media}</style>` +
		`<path class="o" d="${RING}" fill="none" stroke-width="7" stroke-linecap="round"/><circle class="s" cx="49.23" cy="12.53" r="6.5"/></svg>`
	);
}

export const faviconHref = (prefs: Pick<Prefs, 'mode' | 'light' | 'dark'>) => 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(prefs));
