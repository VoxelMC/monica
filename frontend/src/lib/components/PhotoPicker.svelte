<script lang="ts">
	// Change a contact's photo. The browser crops the picked image to a square
	// (slider to choose which part), shrinks it, and shows it before anything is
	// sent. The server checks it again (guards: photo.upload, contact.avatar).
	import { enhance } from '$app/forms';
	import { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE } from '#lib/photo.js';

	interface Props {
		contactId: number;
		updatedAt: string;
		name: string;
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { contactId, updatedAt, name, ondone }: Props = $props();

	let input: HTMLInputElement;
	let bitmap = $state<ImageBitmap | null>(null);
	let offset = $state(0.5); // 0 = top/left, 1 = bottom/right
	let dataUrl = $state('');
	let error = $state('');
	let busy = $state(false);
	const portrait = $derived(bitmap ? bitmap.height > bitmap.width : false);
	const square = $derived(bitmap ? bitmap.width === bitmap.height : true);

	async function picked() {
		error = '';
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) return void (error = 'That is not an image.');
		try {
			// Applies the camera's rotation (EXIF), so the photo is the right way up
			bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			error = /hei[cf]/i.test(file.type + file.name)
				? 'This browser cannot read HEIC photos. Pick a JPEG, or set the camera to save JPEG.'
				: 'This image could not be read. Try another one.';
			return;
		}
		offset = bitmap.height > bitmap.width ? 0.3 : 0.5; // faces sit high in portraits
		render();
	}

	function render() {
		if (!bitmap) return;
		const side = Math.min(bitmap.width, bitmap.height);
		const out = Math.min(side, PHOTO_MAX_SIDE);
		const sx = bitmap.width > side ? (bitmap.width - side) * offset : 0;
		const sy = bitmap.height > side ? (bitmap.height - side) * offset : 0;
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = out;
		const g = canvas.getContext('2d')!;
		g.imageSmoothingQuality = 'high';
		g.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
		// Smallest quality loss that fits the limit
		for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
			dataUrl = canvas.toDataURL('image/jpeg', q);
			if (dataUrl.length * 0.75 <= PHOTO_MAX_BYTES) return;
		}
		dataUrl = '';
		error = 'This image is too detailed to shrink enough. Try another one.';
	}

	function close() {
		bitmap?.close();
		bitmap = null;
		dataUrl = '';
	}
</script>

<button type="button" class="text-sm text-accent hover:underline" onclick={() => input.click()} data-testid="change-photo">Change photo</button>
<input bind:this={input} type="file" accept="image/*" class="hidden" onchange={picked} data-testid="photo-input" />
{#if error}<p class="mt-1 text-sm text-attention" role="alert">{error}</p>{/if}

{#if bitmap && dataUrl}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="photo-title">
		<div class="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<h2 id="photo-title" class="text-lg font-semibold">New photo for {name}</h2>
			<img src={dataUrl} alt="How it will look" class="mx-auto mt-3 aspect-square w-56 max-w-full rounded-[var(--radius-photo-lg)] bg-surface-2 object-cover" data-testid="photo-preview" />
			{#if !square}
				<label class="mt-3 block text-sm">
					<span class="text-muted">Move the square {portrait ? 'up or down' : 'left or right'}</span>
					<input type="range" min="0" max="1" step="0.01" bind:value={offset} oninput={render} class="mt-1 w-full accent-[var(--accent-solid)]" />
				</label>
			{/if}
			<p class="mt-3 text-sm text-muted">This replaces the profile photo in Monica; your phone gets it on its next contact sync. The old photo stays in Monica’s Photos.</p>
			<form
				method="POST"
				action="?/photo"
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						busy = false;
						const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
						ondone(d ?? { ok: false, message: 'Something went wrong; the photo may not have changed. Check the audit log.' });
						close();
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="contactId" value={contactId} />
				<input type="hidden" name="updatedAt" value={updatedAt} />
				<input type="hidden" name="photo" value={dataUrl} />
				<div class="mt-4 flex gap-2">
					<button type="button" onclick={close} class="min-h-11 flex-1 rounded-[var(--radius-input)] border border-line font-medium hover:bg-surface-2">Cancel</button>
					<button type="submit" disabled={busy} class="min-h-11 flex-1 rounded-[var(--radius-input)] bg-accent-solid font-semibold text-on-accent disabled:opacity-40" data-testid="photo-save">
						{busy ? 'Saving…' : 'Use this photo'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
