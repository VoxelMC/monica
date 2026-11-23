// Change a contact's photo (2026-11-23): upload the image (POST /api/photos),
// then make it the avatar (PUT /api/contacts/{id}/avatar, conflict-checked).
// Both writes go through the guards. The old photo stays in Monica.
import { z } from 'zod';
import { checkPhotoDataUrl } from '../photo';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

const form = z.object({
	contactId: z.coerce.number().int().positive(),
	updatedAt: z.string().min(1).max(40),
	photo: z.string().max(2_100_000)
});

export interface PhotoSaveResult {
	ok: boolean;
	message: string;
	dryRun: boolean;
	photoId: number | null;
}

export async function savePhoto(guards: Guards, data: FormData): Promise<PhotoSaveResult> {
	const fail = (message: string, photoId: number | null = null): PhotoSaveResult => ({ ok: false, message, dryRun: false, photoId });
	const parsed = form.safeParse({ contactId: data.get('contactId'), updatedAt: data.get('updatedAt'), photo: data.get('photo') });
	if (!parsed.success) return fail('The photo could not be read. Pick it again.');
	const { contactId, updatedAt, photo } = parsed.data;
	const problem = checkPhotoDataUrl(photo);
	if (problem) return fail(`Not saved: ${problem}.`);

	// 1. Upload
	let photoId: number | null = null;
	try {
		const res = await guards.create('photo.upload', { contact_id: contactId, data: photo });
		if (res.dryRun) return { ok: true, dryRun: true, photoId: null, message: 'Dry run: the upload is in the audit log; nothing was sent.' };
		const id = (res.response as { data?: { id?: unknown } } | null)?.data?.id;
		photoId = typeof id === 'number' ? id : null;
	} catch (err) {
		return fail(describe(err, 'Nothing was changed.'));
	}
	if (photoId === null) return fail('Monica took the photo but did not say its id, so it was not set as the profile photo. You can pick it in Monica (Photos).');

	// 2. Make it the avatar
	try {
		await guards.update('contact.avatar', contactId, { source: 'photo', photo_id: photoId }, updatedAt);
	} catch (err) {
		const why =
			err instanceof ConflictError
				? 'This contact was changed somewhere else since you opened the page. Reload and pick the photo again.'
				: describe(err, '');
		return fail(`${why} The photo was uploaded to Monica (Photos) but is not the profile photo.`.replace(/\s+/g, ' ').trim(), photoId);
	}
	return { ok: true, dryRun: false, photoId, message: 'Photo changed. Your phone gets it on its next contact sync.' };
}

function describe(err: unknown, consequence: string): string {
	if (err instanceof WriteRefusedError && err.reason === 'read-only') return `orbit is read-only (ORBIT_READ_ONLY=true). ${consequence}`;
	if (err instanceof WriteRefusedError) return `orbit refused it (${err.reason}). ${consequence}`;
	if (err instanceof MonicaError) return `${err.message}. ${consequence}`;
	return `Something went wrong. ${consequence}`;
}
