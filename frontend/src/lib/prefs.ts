// Per-device display preferences, kept in a cookie so the server renders the
// right theme and font on the first paint (no flash). Not secret; no Monica data.
import { DARK_THEMES, DEFAULT_DARK, DEFAULT_LIGHT, LIGHT_THEMES } from './themes';

export const FONTS = [
	{ id: 'lora', name: 'Lora', stack: "'Lora Variable', Georgia, serif" },
	{ id: 'baskerville', name: 'Libre Baskerville', stack: "'Libre Baskerville', Georgia, serif" },
	{ id: 'garamond', name: 'EB Garamond', stack: "'EB Garamond Variable', Garamond, Georgia, serif" },
	{ id: 'system', name: 'System sans-serif', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }
] as const;

export type FontId = (typeof FONTS)[number]['id'];
export type ThemeMode = 'system' | 'light' | 'dark';
export type PeopleView = 'cards' | 'lines';

export interface Prefs {
	mode: ThemeMode;
	light: string;
	dark: string;
	font: FontId;
	peopleView: PeopleView;
}

export const DEFAULT_PREFS: Prefs = { mode: 'system', light: DEFAULT_LIGHT, dark: DEFAULT_DARK, font: 'lora', peopleView: 'cards' };
export const PREFS_COOKIE = 'orbit-prefs';

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
	typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Parse the cookie value; anything unknown falls back to the default. */
export function parsePrefs(raw: string | undefined | null): Prefs {
	let o: Record<string, unknown> = {};
	try {
		if (raw) o = JSON.parse(raw);
	} catch {
		/* ignore a malformed cookie */
	}
	if (!o || typeof o !== 'object') o = {};
	return {
		mode: oneOf(o.mode, ['system', 'light', 'dark'] as const, DEFAULT_PREFS.mode),
		light: oneOf(o.light, LIGHT_THEMES.map((t) => t.id), DEFAULT_PREFS.light),
		dark: oneOf(o.dark, DARK_THEMES.map((t) => t.id), DEFAULT_PREFS.dark),
		font: oneOf(o.font, FONTS.map((f) => f.id), DEFAULT_PREFS.font),
		peopleView: oneOf(o.peopleView, ['cards', 'lines'] as const, DEFAULT_PREFS.peopleView)
	};
}

/** Attributes for <html>; values are validated ids, safe to inline. */
export function htmlAttrs(p: Prefs): string {
	return `data-mode="${p.mode}" data-light="${p.light}" data-dark="${p.dark}" data-font="${p.font}"`;
}

/** Save in the browser and apply at once (settings page, view toggle). */
export function savePrefs(p: Prefs): void {
	document.cookie = `${PREFS_COOKIE}=${encodeURIComponent(JSON.stringify(p))}; Path=/; Max-Age=31536000; SameSite=Lax`;
	const el = document.documentElement;
	el.dataset.mode = p.mode;
	el.dataset.light = p.light;
	el.dataset.dark = p.dark;
	el.dataset.font = p.font;
}
