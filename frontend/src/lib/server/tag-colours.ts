// Tag colours: orbit's own data (see src/lib/tag-colours.ts). Nothing here writes to Monica.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { OrbitDb } from './db';
import { tagColours } from './db/schema';
import { HEX, tagColourKey, type TagChoices } from '../tag-colours.js';

export function getTagColours(db: OrbitDb): TagChoices {
	const out: TagChoices = {};
	for (const r of db.select().from(tagColours).all()) out[r.nameKey] = { hue: r.hue, color: r.color ?? null };
	return out;
}

/** Set a theme colour (hue 1-6), a custom colour (color '#rrggbb'), or clear (hue 0, no color = automatic). */
export function setTagColour(db: OrbitDb, form: FormData): { ok: boolean; message: string } {
	const parsed = z
		.object({ name: z.string().trim().min(1).max(255), hue: z.coerce.number().int().min(0).max(6), color: z.string().trim().toLowerCase().regex(HEX).optional() })
		.safeParse({ name: form.get('name'), hue: form.get('hue') ?? '0', color: form.get('color') || undefined });
	if (!parsed.success) return { ok: false, message: 'The form could not be read. Reload the page and try again.' };
	const { name, color } = parsed.data;
	const hue = color ? 0 : parsed.data.hue;
	const key = tagColourKey(name);
	if (hue === 0 && !color) {
		db.delete(tagColours).where(eq(tagColours.nameKey, key)).run();
		return { ok: true, message: `“${name}” uses its automatic colour again.` };
	}
	const updatedAt = new Date().toISOString();
	const set = { hue, color: color ?? null, updatedAt };
	db.insert(tagColours).values({ nameKey: key, ...set }).onConflictDoUpdate({ target: tagColours.nameKey, set }).run();
	return { ok: true, message: `Colour saved for “${name}”.` };
}

/** After a rename in Monica: the tag keeps its colour under the new name. */
export function moveTagColour(db: OrbitDb, from: string, to: string): void {
	const a = tagColourKey(from);
	const b = tagColourKey(to);
	if (a === b) return;
	db.transaction((tx) => {
		const row = tx.select().from(tagColours).where(eq(tagColours.nameKey, a)).get();
		if (!row) return;
		tx.delete(tagColours).where(eq(tagColours.nameKey, a)).run();
		const set = { hue: row.hue, color: row.color, updatedAt: new Date().toISOString() };
		tx.insert(tagColours).values({ nameKey: b, ...set }).onConflictDoUpdate({ target: tagColours.nameKey, set }).run();
	});
}
