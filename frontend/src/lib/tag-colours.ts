// Tag colours (2026-11-26): a tag uses the colour the owner picked on the Tags page
// (one of the theme's six), or else the automatic one from its name (tagHue).
// The root layout loads the choices and shares them through context, so <Tag> and
// the tag lists all agree.
import { getContext, setContext } from 'svelte';
import { tagHue } from './themes.js';

export type TagHues = Record<string, number>;

/** "Friends", " friends " and "FRIENDS" share one colour. */
export function tagColourKey(name: string): string {
	return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function hueOf(name: string, chosen: TagHues | undefined): number {
	const h = chosen?.[tagColourKey(name)];
	return h && h >= 1 && h <= 6 ? h : tagHue(name);
}

const KEY = Symbol('orbit:tagHues');
/** In the root layout: share the loaded choices (a getter, so updates show). */
export function provideTagHues(get: () => TagHues): void {
	setContext(KEY, get);
}
/** In any component: (name) => colour slot 1-6. */
export function useTagHue(): (name: string) => number {
	const get = getContext<(() => TagHues) | undefined>(KEY);
	return (name) => hueOf(name, get?.());
}
