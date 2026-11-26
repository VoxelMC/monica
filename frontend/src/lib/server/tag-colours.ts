// Tag colours: orbit's own data (see src/lib/tag-colours.ts). Nothing here writes to Monica.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { OrbitDb } from './db';
import { tagColours } from './db/schema';
import { tagColourKey, type TagHues } from '../tag-colours.js';

export function getTagHues(db: OrbitDb): TagHues {
	const out: TagHues = {};
	for (const r of db.select().from(tagColours).all()) out[r.nameKey] = r.hue;
	return out;
}

/** Set (hue 1-6) or clear (hue 0 = automatic) one tag's colour. */
export function setTagColour(db: OrbitDb, form: FormData): { ok: boolean; message: string } {
	const parsed = z.object({ name: z.string().trim().min(1).max(255), hue: z.coerce.number().int().min(0).max(6) }).safeParse({ name: form.get('name'), hue: form.get('hue') });
	if (!parsed.success) return { ok: false, message: 'The form could not be read. Reload the page and try again.' };
	const { name, hue } = parsed.data;
	const key = tagColourKey(name);
	if (hue === 0) {
		db.delete(tagColours).where(eq(tagColours.nameKey, key)).run();
		return { ok: true, message: `“${name}” uses its automatic colour again.` };
	}
	const updatedAt = new Date().toISOString();
	db.insert(tagColours).values({ nameKey: key, hue, updatedAt }).onConflictDoUpdate({ target: tagColours.nameKey, set: { hue, updatedAt } }).run();
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
		tx.insert(tagColours).values({ nameKey: b, hue: row.hue, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: tagColours.nameKey, set: { hue: row.hue } }).run();
	});
}
