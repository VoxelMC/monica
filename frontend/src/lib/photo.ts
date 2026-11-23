// Contact photos (2026-11-23). Shared by the browser (resizing before upload)
// and the server (the guard checks every upload with checkPhotoDataUrl).
//
// Monica 4.1.2 ignores a photo sent from a phone over CardDAV when the contact
// already has one (ImportVCard::importPhoto), then syncs its own back. So orbit
// uploads the photo through the API (POST /api/photos, base64 `data`) and sets
// it as the avatar (PUT /api/contacts/{id}/avatar); phones get it on next sync.

/** Longest side after resizing in the browser. Phones show contact photos small. */
export const PHOTO_MAX_SIDE = 800;
/** Largest decoded image the guard accepts (resized photos are ~50–200 KB; adapter-node accepts 512 KB bodies). */
export const PHOTO_MAX_BYTES = 350_000;

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

const MAGIC: Record<string, (b: number[]) => boolean> = {
	jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
	webp: (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP'
};

/** A JPEG, PNG or WebP data URL whose bytes really are that image type, within the size limit. Returns a reason to refuse, or null. */
export function checkPhotoDataUrl(value: unknown): string | null {
	if (typeof value !== 'string') return 'the photo is missing';
	const m = DATA_URL.exec(value);
	if (!m) return 'the photo must be a JPEG, PNG or WebP image';
	const b64 = m[2];
	const bytes = Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
	if (bytes > PHOTO_MAX_BYTES) return `the photo is too large (${Math.round(bytes / 1000)} KB, limit ${PHOTO_MAX_BYTES / 1000} KB)`;
	if (bytes < 100) return 'the photo is empty or broken';
	let head: number[];
	try {
		head = [...atob(b64.slice(0, 16))].map((c) => c.charCodeAt(0));
	} catch {
		return 'the photo is broken';
	}
	if (!MAGIC[m[1]](head)) return `the file is not really a ${m[1].toUpperCase()} image`;
	return null;
}
