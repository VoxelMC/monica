<script lang="ts">
	// Confirmation for removing a hangout, note or journal entry. Shows exactly what
	// goes; the Remove button only unlocks after the tick. The server re-checks the
	// tick, saves a full copy to the audit log, and refuses if the entry changed.
	import { enhance } from '$app/forms';

	interface Props {
		kind: 'activity' | 'note' | 'journal';
		id: number;
		updatedAt: string;
		title: string;
		/** Lines describing the entry (date, people, text). */
		details: string[];
		/** Extra consequence, e.g. "It disappears for all 3 people who were there." */
		warning?: string;
		action?: string;
		onclose: () => void;
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { kind, id, updatedAt, title, details, warning, action = '?/remove', onclose, ondone }: Props = $props();
	let understood = $state(false);
	let busy = $state(false);
	const what = $derived(kind === 'activity' ? 'hangout' : kind === 'note' ? 'note' : 'journal entry');
</script>

<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="rm-title">
	<div class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
		<h2 id="rm-title" class="text-lg font-semibold">Remove this {what}?</h2>
		<div class="mt-3 rounded-[var(--radius-input)] border border-line bg-surface-2 p-3 text-sm" data-testid="remove-details">
			<p class="font-semibold">{title}</p>
			{#each details.filter(Boolean) as line, i (i)}<p class="mt-1 break-words whitespace-pre-line text-muted">{line}</p>{/each}
		</div>
		<p class="mt-3 text-sm">This removes it from Monica, so it disappears from your phone and Monica’s own pages too. {warning ?? ''}</p>
		<p class="mt-1 text-sm text-muted">orbit keeps a full copy in its audit log, so it can be re-entered by hand if needed.</p>
		<form
			method="POST"
			{action}
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
					ondone(d ?? { ok: false, message: 'Something went wrong; it may not have been removed. Check the audit log.' });
					await update({ reset: false }); // reload the page data
				};
			}}
		>
			<input type="hidden" name="kind" value={kind} />
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="updatedAt" value={updatedAt} />
			<label class="mt-4 flex items-start gap-3 text-sm">
				<input type="checkbox" name="confirm" value="yes" bind:checked={understood} class="mt-0.5 size-5 accent-[var(--attention)]" />
				<span>I understand this removes the {what} from Monica.</span>
			</label>
			<button
				type="submit"
				disabled={!understood || busy}
				class="mt-4 min-h-11 w-full rounded-[var(--radius-input)] bg-attention font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-40"
			>
				{busy ? 'Removing…' : 'Remove permanently'}
			</button>
		</form>
		<button type="button" disabled={busy} class="mt-2 min-h-11 w-full rounded-[var(--radius-input)] border border-control" onclick={onclose}>Cancel</button>
	</div>
</div>
