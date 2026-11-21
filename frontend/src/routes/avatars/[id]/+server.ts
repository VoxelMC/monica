// Serves one contact's avatar image. Read-only, fixed purpose: not a Monica proxy.
import { error } from '@sveltejs/kit';
import { monica } from '#lib/server/monica/index.js';
import { getAvatar } from '#lib/server/monica/contacts.js';
import type { RequestHandler } from './$types';

const TTL = 10 * 60_000;
const cache = new Map<number, { at: number; value: Promise<{ mime: string; bytes: Uint8Array } | null> }>();

export const GET: RequestHandler = async ({ params }) => {
	if (!/^\d{1,10}$/.test(params.id)) error(404, 'Not found');
	const id = Number(params.id);

	let hit = cache.get(id);
	if (!hit || Date.now() - hit.at > TTL) {
		hit = { at: Date.now(), value: getAvatar(monica, id) };
		cache.set(id, hit);
		hit.value.catch(() => cache.delete(id));
	}
	const avatar = await hit.value.catch(() => null);
	if (!avatar) error(404, 'No avatar');

	return new Response(avatar.bytes as BodyInit, {
		headers: {
			'content-type': avatar.mime,
			'cache-control': 'private, max-age=600',
			'x-content-type-options': 'nosniff'
		}
	});
};
