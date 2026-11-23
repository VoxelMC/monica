// Serves one contact's avatar image. Read-only, fixed purpose: not a Monica proxy.
// `?v=` is the photo's file name (photoKey): a new photo gets a new URL, so
// neither this cache nor the browser's can show the old one after a change.
import { error } from '@sveltejs/kit';
import { monica } from '#lib/server/monica/index.js';
import { getAvatar } from '#lib/server/monica/contacts.js';
import type { RequestHandler } from './$types';

const TTL = 10 * 60_000;
const cache = new Map<number, { at: number; v: string; value: Promise<{ mime: string; bytes: Uint8Array } | null> }>();

export const GET: RequestHandler = async ({ params, url }) => {
	if (!/^\d{1,10}$/.test(params.id)) error(404, 'Not found');
	const id = Number(params.id);
	const v = (url.searchParams.get('v') ?? '').slice(0, 200);

	let hit = cache.get(id);
	if (!hit || hit.v !== v || Date.now() - hit.at > TTL) {
		hit = { at: Date.now(), v, value: getAvatar(monica, id) };
		cache.set(id, hit);
		const mine = hit;
		hit.value.catch(() => cache.get(id) === mine && cache.delete(id));
	}
	const avatar = await hit.value.catch(() => null);
	if (!avatar) error(404, 'No avatar');

	return new Response(avatar.bytes as BodyInit, {
		headers: {
			'content-type': avatar.mime,
			// Versioned URLs can be kept; the bare URL only briefly
			'cache-control': v ? 'private, max-age=86400' : 'private, max-age=600',
			'x-content-type-options': 'nosniff'
		}
	});
};
