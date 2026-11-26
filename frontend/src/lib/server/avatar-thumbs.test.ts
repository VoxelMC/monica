import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { getThumb, storedThumb, THUMB_PX } from './avatar-thumbs';
import { memoryAudit } from './monica/test-helpers';

const big = async () => new Uint8Array(await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#2f6f5e' } }).jpeg().toBuffer());

describe('avatar thumbnails', () => {
	it('shrinks to a square WebP, stores it under the photo key and reuses it', async () => {
		const { db } = memoryAudit();
		const jpeg = await big();
		let loads = 0;
		const load = async () => (loads++, { mime: 'image/jpeg', bytes: jpeg });
		const t = await getThumb(db, 7, 'a.jpg', load);
		expect(t?.mime).toBe('image/webp');
		const meta = await sharp(t!.bytes).metadata();
		expect([meta.width, meta.height]).toEqual([THUMB_PX, THUMB_PX]);
		expect(t!.bytes.length).toBeLessThan(jpeg.length);
		await getThumb(db, 7, 'a.jpg', load);
		expect(loads).toBe(1);
		// A new photo key replaces the stored one
		await getThumb(db, 7, 'b.jpg', load);
		expect(loads).toBe(2);
		expect(storedThumb(db, 7, 'a.jpg')).toBeNull();
		expect(storedThumb(db, 7, 'b.jpg')).not.toBeNull();
	});

	it('concurrent requests load once; no photo stores nothing; bad image data is served as it came', async () => {
		const { db } = memoryAudit();
		let loads = 0;
		const jpeg = await big();
		await Promise.all([1, 2, 3].map(() => getThumb(db, 8, 'x.jpg', async () => (loads++, { mime: 'image/jpeg', bytes: jpeg }))));
		expect(loads).toBe(1);
		expect(await getThumb(db, 9, 'y.jpg', async () => null)).toBeNull();
		expect(storedThumb(db, 9, 'y.jpg')).toBeNull();
		const junk = { mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) };
		expect(await getThumb(db, 10, 'z.jpg', async () => junk)).toBe(junk);
		expect(storedThumb(db, 10, 'z.jpg')).toBeNull();
	});
});
