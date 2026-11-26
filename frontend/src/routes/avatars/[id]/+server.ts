// Serves one contact's avatar image. Read-only, fixed purpose: not a Monica proxy.
// `?v=` is the photo's file name (photoKey): a new photo gets a new URL, so
// neither orbit's copy nor the browser's can show the old one after a change.
// With `?v=`, the image is a small thumbnail kept in orbit's database (fetched
// from Monica once per photo). Without it, the full photo, cached briefly.
import { error } from '@sveltejs/kit';
import { getDb, monica } from '#lib/server/monica/index.js';
import { getAvatar, getPhotoByKey } from '#lib/server/monica/contacts.js';
import { getThumb } from '#lib/server/avatar-thumbs.js';
import type { RequestHandler } from './$types';

const TTL = 10 * 60_000;
const cache = new Map<number, { at: number; value: Promise<{ mime: string; bytes: Uint8Array } | null> }>();

function fullPhoto(id: number) {
	let hit = cache.get(id);
	if (!hit || Date.now() - hit.at > TTL) {
		hit = { at: Date.now(), value: getAvatar(monica, id) };
		cache.set(id, hit);
		const mine = hit;
		hit.value.catch(() => cache.get(id) === mine && cache.delete(id));
	}
	return hit.value;
}

export const GET: RequestHandler = async ({ params, url }) => {
	if (!/^\d{1,10}$/.test(params.id)) error(404, 'Not found');
	const id = Number(params.id);
	const v = (url.searchParams.get('v') ?? '').slice(0, 200);

	const avatar = await (v ? getThumb(getDb(), id, v, () => getPhotoByKey(monica, id, v)) : fullPhoto(id)).catch(() => null);
	if (!avatar) error(404, 'No avatar');

	return new Response(avatar.bytes as BodyInit, {
		headers: {
			'content-type': avatar.mime,
			// A versioned URL never changes content, so the browser can keep it
			'cache-control': v ? 'private, max-age=31536000, immutable' : 'private, max-age=600',
			'x-content-type-options': 'nosniff'
		}
	});
};
