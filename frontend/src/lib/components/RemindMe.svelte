<script lang="ts">
	// "Remind me…" for one contact: a time (quick picks or exact) and an optional
	// note. Saved in orbit's database; at that time a notification goes to the
	// owner's phone through ntfy. Nothing is written to Monica.
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { NOTE_MAX, quickPicks, toLocalInput } from '#lib/reminders.js';

	interface Props {
		contactId: number;
		name: string;
		ntfyConfigured: boolean;
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { contactId, name, ntfyConfigured, ondone }: Props = $props();

	let open = $state(false);
	let when = $state('');
	let note = $state('');
	let busy = $state(false);
	let error = $state('');
	let picks = $state<{ label: string; at: Date }[]>([]);
	const dueAt = $derived.by(() => {
		const t = when ? new Date(when) : null;
		return t && !Number.isNaN(t.getTime()) ? t.toISOString() : '';
	});
	const timeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

	function show() {
		picks = quickPicks();
		when = '';
		note = '';
		error = '';
		open = true;
	}
</script>

<button type="button" onclick={show} class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-input)] border border-line font-medium hover:bg-surface-2" data-testid="remind-me">
	<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
	Remind me…
</button>

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="remind-title">
		<div class="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<h2 id="remind-title" class="text-lg font-semibold">Remind me about {name}</h2>
			<form
				method="POST"
				action="/reminders?/create"
				use:enhance={() => {
					busy = true;
					// Posts to /reminders; stay on this page and refresh its data instead of navigating there
					return async ({ result }) => {
						busy = false;
						const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
						if (d && !d.ok) return void (error = d.message); // keep the dialog open to fix it
						ondone(d ?? { ok: false, message: 'Something went wrong; the reminder may not be saved.' });
						open = false;
						await refreshAll();
					};
				}}
			>
				<input type="hidden" name="contactId" value={contactId} />
				<input type="hidden" name="dueAt" value={dueAt} />
				<input type="hidden" name="timeZone" value={timeZone} />
				<fieldset class="mt-3 min-w-0">
					<legend class="text-sm text-muted">When</legend>
					<div class="mt-1 flex flex-wrap gap-2">
						{#each picks as p (p.label)}
							{@const v = toLocalInput(p.at)}
							<button
								type="button"
								onclick={() => (when = v)}
								aria-pressed={when === v}
								class="min-h-11 rounded-[var(--radius-chip)] border px-3 text-sm {when === v ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-line hover:bg-surface-2'}"
							>
								{p.label}
							</button>
						{/each}
					</div>
					<label class="mt-2 block text-sm">
						<span class="text-muted">Or exactly</span>
						<input type="datetime-local" bind:value={when} min={toLocalInput(new Date())} required class="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3" data-testid="remind-when" />
					</label>
				</fieldset>
				<label class="mt-3 block text-sm">
					<span class="text-muted">Note (optional)</span>
					<textarea name="note" bind:value={note} maxlength={NOTE_MAX} rows="2" placeholder="e.g. Ask how the exam went" class="mt-1 block w-full rounded-[var(--radius-input)] border border-line bg-surface px-3 py-2" data-testid="remind-note"></textarea>
				</label>
				{#if !ntfyConfigured}
					<p class="mt-3 text-sm text-attention">Phone notifications are not set up yet, so this only shows in orbit. See DEPLOY.md, “Reminders”.</p>
				{/if}
				{#if error}<p class="mt-3 text-sm text-attention" role="alert">{error}</p>{/if}
				<div class="mt-4 flex gap-2">
					<button type="button" onclick={() => (open = false)} class="min-h-11 flex-1 rounded-[var(--radius-input)] border border-line font-medium hover:bg-surface-2">Cancel</button>
					<button type="submit" disabled={busy || !dueAt} class="min-h-11 flex-1 rounded-[var(--radius-input)] bg-accent-solid font-semibold text-on-accent disabled:opacity-40" data-testid="remind-save">
						{busy ? 'Saving…' : 'Set reminder'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
