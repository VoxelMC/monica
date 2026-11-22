// Colour themes. Each theme starts from its official palette (base colours);
// text-bearing tokens are then nudged just far enough to meet WCAG contrast
// (text 4.5:1, controls and dots 3:1) so every theme stays readable.
// src/lib/themes.test.ts checks every token pair of every theme.

export type Mode = 'light' | 'dark';

interface Base {
	id: string;
	name: string;
	family: string;
	mode: Mode;
	bg: string; // page
	surface: string; // cards, bars
	surface2: string; // hover, pressed, quiet fills
	line: string; // hairlines
	fg: string; // body text
	muted: string; // secondary text (adjusted for contrast)
	accent: string; // links, active, selected (adjusted for contrast)
	attention: string; // birthdays soon, errors
	/** Six hues for tags and timeline dots, from the theme's own palette. */
	hues: [string, string, string, string, string, string];
}

export interface Theme {
	id: string;
	name: string;
	family: string;
	mode: Mode;
	tokens: Record<string, string>;
	/** Preview swatches for the settings page. */
	swatches: string[];
}

// ---- colour maths ------------------------------------------------------------

const toRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function luminance(hex: string): number {
	const [r, g, b] = toRgb(hex).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** Mix `a` into `b` by `t` (0 = b, 1 = a). */
export function mix(a: string, b: string, t: number): string {
	const [x, y] = [toRgb(a), toRgb(b)];
	return toHex(x.map((v, i) => v * t + y[i] * (1 - t)));
}

/**
 * Move `fg` toward black (on light backgrounds) or white (on dark ones) in small
 * steps until it reaches `ratio` against every background given. Keeps the hue.
 */
export function ensureContrast(fg: string, bgs: string[], ratio: number): string {
	const dark = luminance(bgs[0]) > 0.4;
	const target = dark ? '#000000' : '#ffffff';
	let c = fg;
	for (let t = 0; t <= 1.0001; t += 0.02) {
		c = mix(target, fg, t);
		if (bgs.every((b) => contrast(c, b) >= ratio)) return c;
	}
	return target;
}

function derive(b: Base): Theme {
	const bgs = [b.bg, b.surface, b.surface2];
	const fg = ensureContrast(b.fg, bgs, 7);
	const muted = ensureContrast(b.muted, bgs, 4.6);
	const accent = ensureContrast(b.accent, bgs, 4.6);
	// Solid accent (selected chips, primary buttons): the theme's accent with whichever
	// text colour reads best on it.
	// It must also stand out from the surface (3:1), so pale accents get a deeper fill.
	const fill = ensureContrast(b.accent, [b.surface], 3.1);
	const onAccent = [b.bg, '#ffffff', '#111111'].sort((x, y) => contrast(y, fill) - contrast(x, fill))[0];
	const accentSolid = contrast(onAccent, fill) >= 4.6 ? fill : ensureContrast(fill, [onAccent], 4.6);
	const accentSoft = mix(b.accent, b.surface, b.mode === 'light' ? 0.12 : 0.2);
	const tokens: Record<string, string> = {
		bg: b.bg,
		surface: b.surface,
		'surface-2': b.surface2,
		fg,
		muted,
		line: b.line,
		control: ensureContrast(mix(b.muted, b.line, 0.6), [b.bg, b.surface], 3.1),
		accent,
		'accent-solid': accentSolid,
		'on-accent': onAccent,
		'accent-soft': accentSoft,
		'on-accent-soft': ensureContrast(b.accent, [accentSoft], 4.6),
		attention: ensureContrast(b.attention, [b.bg, b.surface], 4.6)
	};
	b.hues.forEach((h, i) => {
		const bg = mix(h, b.surface, b.mode === 'light' ? 0.16 : 0.22);
		tokens[`tag-${i + 1}-bg`] = bg;
		tokens[`tag-${i + 1}-fg`] = ensureContrast(h, [bg, b.surface], 4.6);
		tokens[`hue-${i + 1}`] = ensureContrast(h, [b.surface], 3.1);
	});
	return { id: b.id, name: b.name, family: b.family, mode: b.mode, tokens, swatches: [b.bg, b.surface2, b.fg, b.accent, ...b.hues.slice(0, 4)] };
}

// ---- palettes ----------------------------------------------------------------

const bases: Base[] = [
	// orbit's own: warm paper and neutral ink (no blue cast)
	{
		id: 'orbit-paper', name: 'Paper', family: 'orbit', mode: 'light',
		bg: '#f7f6f3', surface: '#fdfcfa', surface2: '#efede8', line: '#e2dfd8',
		fg: '#1f1d1a', muted: '#6b665e', accent: '#2f6f5e', attention: '#b4232c',
		hues: ['#2f6f5e', '#8a5a2b', '#3d5a8a', '#7a3e6b', '#9a6b00', '#5b6b2e']
	},
	{
		id: 'orbit-ink', name: 'Ink', family: 'orbit', mode: 'dark',
		bg: '#161514', surface: '#1e1d1b', surface2: '#2a2826', line: '#302e2b',
		fg: '#ece8e1', muted: '#a8a299', accent: '#7fc4ad', attention: '#f08a8a',
		hues: ['#7fc4ad', '#e0a96d', '#94b3e0', '#d49ac2', '#e6c86e', '#b5c97a']
	},
	// Everforest (medium) — github.com/sainnhe/everforest
	{
		id: 'everforest-light', name: 'Everforest Light', family: 'Everforest', mode: 'light',
		bg: '#fdf6e3', surface: '#fffbef', surface2: '#f4f0d9', line: '#e6e2cc',
		fg: '#5c6a72', muted: '#829181', accent: '#35a77c', attention: '#f85552',
		hues: ['#8da101', '#35a77c', '#3a94c5', '#df69ba', '#f57d26', '#dfa000']
	},
	{
		id: 'everforest-dark', name: 'Everforest Dark', family: 'Everforest', mode: 'dark',
		bg: '#2d353b', surface: '#343f44', surface2: '#3d484d', line: '#475258',
		fg: '#d3c6aa', muted: '#9da9a0', accent: '#a7c080', attention: '#e67e80',
		hues: ['#a7c080', '#83c092', '#7fbbb3', '#d699b6', '#e69875', '#dbbc7f']
	},
	// Ayu — github.com/ayu-theme/ayu-colors
	{
		id: 'ayu-light', name: 'Ayu Light', family: 'Ayu', mode: 'light',
		bg: '#f8f9fa', surface: '#fcfcfc', surface2: '#eef0f2', line: '#e1e3e6',
		fg: '#5c6166', muted: '#8a9199', accent: '#fa8d3e', attention: '#e65050',
		hues: ['#86b300', '#4cbf99', '#55b4d4', '#a37acc', '#fa8d3e', '#f2ae49']
	},
	{
		id: 'ayu-mirage', name: 'Ayu Mirage', family: 'Ayu', mode: 'dark',
		bg: '#1f2430', surface: '#242936', surface2: '#2c3240', line: '#33394a',
		fg: '#cccac2', muted: '#8a9199', accent: '#ffcc66', attention: '#ff6666',
		hues: ['#d5ff80', '#95e6cb', '#73d0ff', '#dfbfff', '#ffad66', '#ffd173']
	},
	{
		id: 'ayu-dark', name: 'Ayu Dark', family: 'Ayu', mode: 'dark',
		bg: '#0d1017', surface: '#131721', surface2: '#1b202b', line: '#232834',
		fg: '#bfbdb6', muted: '#7d8590', accent: '#e6b450', attention: '#d95757',
		hues: ['#aad94c', '#95e6cb', '#59c2ff', '#d2a6ff', '#ff8f40', '#ffb454']
	},
	// Catppuccin — catppuccin.com/palette
	{
		id: 'catppuccin-latte', name: 'Catppuccin Latte', family: 'Catppuccin', mode: 'light',
		bg: '#eff1f5', surface: '#f6f7fa', surface2: '#e6e9ef', line: '#dce0e8',
		fg: '#4c4f69', muted: '#6c6f85', accent: '#8839ef', attention: '#d20f39',
		hues: ['#8839ef', '#1e66f5', '#40a02b', '#fe640b', '#179299', '#ea76cb']
	},
	{
		id: 'catppuccin-frappe', name: 'Catppuccin Frappé', family: 'Catppuccin', mode: 'dark',
		bg: '#303446', surface: '#292c3c', surface2: '#414559', line: '#414559',
		fg: '#c6d0f5', muted: '#a5adce', accent: '#ca9ee6', attention: '#e78284',
		hues: ['#ca9ee6', '#8caaee', '#a6d189', '#ef9f76', '#81c8be', '#f4b8e4']
	},
	{
		id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', family: 'Catppuccin', mode: 'dark',
		bg: '#24273a', surface: '#1e2030', surface2: '#363a4f', line: '#363a4f',
		fg: '#cad3f5', muted: '#a5adcb', accent: '#c6a0f6', attention: '#ed8796',
		hues: ['#c6a0f6', '#8aadf4', '#a6da95', '#f5a97f', '#8bd5ca', '#f5bde6']
	},
	{
		id: 'catppuccin-mocha', name: 'Catppuccin Mocha', family: 'Catppuccin', mode: 'dark',
		bg: '#1e1e2e', surface: '#181825', surface2: '#313244', line: '#313244',
		fg: '#cdd6f4', muted: '#a6adc8', accent: '#cba6f7', attention: '#f38ba8',
		hues: ['#cba6f7', '#89b4fa', '#a6e3a1', '#fab387', '#94e2d5', '#f5c2e7']
	}
];

export const THEMES: Theme[] = bases.map(derive);
export const LIGHT_THEMES = THEMES.filter((t) => t.mode === 'light');
export const DARK_THEMES = THEMES.filter((t) => t.mode === 'dark');
export const DEFAULT_LIGHT = 'orbit-paper';
export const DEFAULT_DARK = 'orbit-ink';
export const themeById = (id: string) => THEMES.find((t) => t.id === id);

const vars = (t: Theme) => Object.entries(t.tokens).map(([k, v]) => `--${k}:${v}`).join(';') + `;color-scheme:${t.mode}`;

/**
 * CSS for all themes, keyed by the attributes on <html> (set server-side from the
 * prefs cookie, so the right theme paints first):
 *   data-mode="system|light|dark" data-light="<id>" data-dark="<id>"
 */
export function themeCss(): string {
	const out: string[] = [];
	const paper = themeById(DEFAULT_LIGHT)!;
	const ink = themeById(DEFAULT_DARK)!;
	out.push(`:root{${vars(paper)}}`);
	out.push(`@media (prefers-color-scheme: dark){:root:not([data-mode]){${vars(ink)}}}`);
	for (const t of LIGHT_THEMES) out.push(`:root[data-mode=light][data-light=${t.id}],:root[data-mode=system][data-light=${t.id}]{${vars(t)}}`);
	for (const t of DARK_THEMES) out.push(`:root[data-mode=dark][data-dark=${t.id}]{${vars(t)}}`);
	out.push(`@media (prefers-color-scheme: dark){${DARK_THEMES.map((t) => `:root[data-mode=system][data-dark=${t.id}]{${vars(t)}}`).join('')}}`);
	return out.join('\n');
}

/** Stable colour slot (1-6) for a tag name. */
export function tagHue(name: string): number {
	let h = 0;
	for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
	return (h % 6) + 1;
}
