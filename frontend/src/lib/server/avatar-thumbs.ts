// Avatar thumbnails: each Monica photo is fetched once, shrunk to a small WebP and
// kept in orbit's database under its photo key. After that, lists show it without
// asking Monica at all (and it survives restarts). A new photo has a new key, so
// the old thumbnail is replaced. Read-only towards Monica.
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { OrbitDb } from './db';
import { avatarThumbs } from './db/schema';

/** Biggest avatar on screen is ~160 CSS px (People → Photos view); 480 px stays sharp on 3x phone screens. */
export const THUMB_PX = 480;
/** Stored under the photo key plus the size, so a size change remakes old thumbnails once. */
const storedKey = (photoKey: string) => `${photoKey}@${THUMB_PX}`;

export interface Image {
	mime: string;
	bytes: Uint8Array;
}

/** Square, cropped to the middle, EXIF rotation applied, WebP. */
export async function makeThumb(bytes: Uint8Array): Promise<Image> {
	const out = await sharp(bytes, { failOn: 'none' })
		.rotate()
		.resize(THUMB_PX, THUMB_PX, { fit: 'cover', withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();
	return { mime: 'image/webp', bytes: new Uint8Array(out) };
}

export function storedThumb(db: OrbitDb, contactId: number, photoKey: string): Image | null {
	const row = db.select().from(avatarThumbs).where(eq(avatarThumbs.monicaContactId, contactId)).get();
	if (!row || row.photoKey !== storedKey(photoKey)) return null;
	return { mime: row.mime, bytes: new Uint8Array(row.bytes) };
}

export function storeThumb(db: OrbitDb, contactId: number, photoKey: string, img: Image): void {
	const values = { monicaContactId: contactId, photoKey: storedKey(photoKey), mime: img.mime, bytes: Buffer.from(img.bytes), createdAt: new Date().toISOString() };
	db.insert(avatarThumbs).values(values).onConflictDoUpdate({ target: avatarThumbs.monicaContactId, set: values }).run();
}

const pending = new Map<string, Promise<Image | null>>();

/**
 * The thumbnail for this contact's photo: from the database, or fetched with
 * `load` (the full photo from Monica), shrunk and stored. If shrinking fails the
 * original is returned and nothing is stored.
 */
export async function getThumb(db: OrbitDb, contactId: number, photoKey: string, load: () => Promise<Image | null>): Promise<Image | null> {
	const have = storedThumb(db, contactId, photoKey);
	if (have) return have;
	const k = `${contactId}:${photoKey}`;
	let job = pending.get(k);
	if (!job) {
		job = (async () => {
			const full = await load();
			if (!full) return null;
			try {
				const thumb = await makeThumb(full.bytes);
				storeThumb(db, contactId, photoKey, thumb);
				return thumb;
			} catch (err) {
				console.warn(`avatar ${contactId}: could not make a thumbnail:`, err instanceof Error ? err.message : err);
				return full;
			}
		})().finally(() => pending.delete(k));
		pending.set(k, job);
	}
	return job;
}
