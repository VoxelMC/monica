<script lang="ts">
	// "+ Add note" on a contact page: plain text, saved to Monica (POST /api/notes).
	import { enhance } from '$app/forms';

	interface Props {
		contactId: number;
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { contactId, ondone }: Props = $props();
	let open = $state(false);
	let body = $state('');
	let busy = $state(false);
	let box = $state<HTMLTextAreaElement>();
</script>

{#if open}
	<form
		method="POST"
		action="?/note"
		class="mb-3"
		data-testid="note-form"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				busy = false;
				const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
				ondone(d ?? { ok: false, message: 'Something went wrong; the note may not be saved. Check the audit log.' });
				if (d?.ok) {
					open = false;
					body = '';
				}
				await update({ reset: false });
			};
		}}
	>
		<input type="hidden" name="contactId" value={contactId} />
		<textarea bind:this={box} name="body" bind:value={body} rows="4" maxlength="100000" placeholder="What you learned, what to remember…" aria-label="Note" class="block w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 py-2" data-testid="note-body"></textarea>
		<div class="mt-2 flex justify-end gap-2">
			<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (open = false)}>Cancel</button>
			<button disabled={busy || !body.trim()} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40" data-testid="note-save">{busy ? 'Saving…' : 'Save note'}</button>
		</div>
	</form>
{:else}
	<button type="button" class="mb-3 text-sm text-accent hover:underline" onclick={() => ((open = true), queueMicrotask(() => box?.focus()))} data-testid="add-note">+ Add note</button>
{/if}
