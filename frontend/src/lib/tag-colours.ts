// Tag colours (2026-11-26): a tag uses the colour the owner picked on the Tags page
// (one of the theme's six, or any custom colour), or else the automatic one from
// its name (tagHue). The root layout loads the choices and shares them through
// context, so <Tag> and the tag lists all agree.
import { getContext, setContext } from 'svelte';
import { tagHue } from './themes.js';

export interface TagChoice {
	/** 1-6 = a theme colour; 0 = custom (`color`). */
	hue: number;
	color: string | null;
}
export type TagChoices = Record<string, TagChoice>;

/** CSS colours for one tag: the dot, the chip background and the chip text. */
export interface TagPaint {
	dot: string;
	bg: string;
	fg: string;
}

/** "Friends", " friends " and "FRIENDS" share one colour. */
export function tagColourKey(name: string): string {
	return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export const HEX = /^#[0-9a-f]{6}$/;

export function paintOf(name: string, chosen: TagChoices | undefined): TagPaint {
	const c = chosen?.[tagColourKey(name)];
	if (c?.color && HEX.test(c.color)) {
		// Custom colour: tinted towards the theme so the chip text stays readable in light and dark themes
		return {
			dot: c.color,
			bg: `color-mix(in oklab, ${c.color} 20%, var(--surface))`,
			fg: `color-mix(in oklab, ${c.color} 55%, var(--fg))`
		};
	}
	const h = c && c.hue >= 1 && c.hue <= 6 ? c.hue : tagHue(name);
	return { dot: `var(--hue-${h})`, bg: `var(--tag-${h}-bg)`, fg: `var(--tag-${h}-fg)` };
}

const KEY = Symbol('orbit:tagChoices');
/** In the root layout: share the loaded choices (a getter, so updates show). */
export function provideTagColours(get: () => TagChoices): void {
	setContext(KEY, get);
}
/** In any component: (name) => the tag's colours. */
export function useTagPaint(): (name: string) => TagPaint {
	const get = getContext<(() => TagChoices) | undefined>(KEY);
	return (name) => paintOf(name, get?.());
}
