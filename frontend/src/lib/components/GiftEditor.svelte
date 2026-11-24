<script lang="ts">
	// Gifts on a contact page (stored in Monica): "+ Gift idea", and "Mark given" /
	// "Undo" per gift. Gifts with a price are changed in Monica (see guards.ts).
	import { enhance } from '$app/forms';

	interface Gift {
		id: number;
		name: string;
		status: string | null;
		comment: string | null;
		amount: string | null;
		href: string | null;
		hasPrice: boolean;
		updatedAt: string | null;
	}
	let { gifts, ondone }: { gifts: Gift[]; ondone: (r: { ok: boolean; message: string }) => void } = $props();
	const label: Record<string, string> = { idea: 'Idea', offered: 'Given', received: 'Received' };
	let adding = $state(false);
	let busy = $state(false);
	let name = $state('');
	let box = $state<HTMLInputElement>();
	const submit = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			busy = false;
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
			ondone(d ?? { ok: false, message: 'Something went wrong; check the audit log.' });
			if (d?.ok) {
				adding = false;
				name = '';
			}
			await update({ reset: d?.ok ?? false });
		};
	};
	const ideas = $derived(gifts.filter((g) => g.status === 'idea'));
	const others = $derived(gifts.filter((g) => g.status !== 'idea'));
	const input = 'mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3';
</script>

{#snippet row(g: Gift)}
	<li class="py-2 text-sm first:pt-0 last:pb-0">
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				{#if g.href}<a href={g.href} target="_blank" rel="noopener noreferrer" class="break-words text-accent">{g.name}</a>{:else}<span class="break-words">{g.name}</span>{/if}
				{#if g.amount || g.comment}<p class="text-xs break-words text-muted">{[g.amount, g.comment].filter(Boolean).join(' · ')}</p>{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1">
				{#if g.status}<span class="text-xs text-muted">{label[g.status] ?? g.status}</span>{/if}
				{#if g.updatedAt && !g.hasPrice && (g.status === 'idea' || g.status === 'offered')}
					<form method="POST" action="?/giftStatus" use:enhance={submit}>
						<input type="hidden" name="giftId" value={g.id} />
						<input type="hidden" name="updatedAt" value={g.updatedAt} />
						<input type="hidden" name="status" value={g.status === 'idea' ? 'offered' : 'idea'} />
						<button disabled={busy} class="min-h-9 rounded-[var(--radius-input)] px-2 text-xs font-medium {g.status === 'idea' ? 'text-accent' : 'text-muted'} hover:bg-surface-2" data-testid="gift-toggle">{g.status === 'idea' ? 'Mark given' : 'Undo'}</button>
					</form>
				{/if}
			</div>
		</div>
	</li>
{/snippet}

{#if gifts.length}
	<ul class="flex flex-col divide-y divide-line" data-testid="gifts">
		{#each ideas as g (g.id)}{@render row(g)}{/each}
		{#each others as g (g.id)}{@render row(g)}{/each}
	</ul>
{:else}
	<p class="text-sm text-muted">No gifts or ideas yet.</p>
{/if}

{#if adding}
	<form method="POST" action="?/giftAdd" use:enhance={submit} class="mt-3 border-t border-line pt-3" data-testid="gift-form">
		<label class="block text-sm"><span class="text-muted">Gift idea</span><input bind:this={box} bind:value={name} name="name" maxlength="255" required class={input} data-testid="gift-name" /></label>
		<label class="mt-2 block text-sm"><span class="text-muted">Link (optional)</span><input name="url" type="url" inputmode="url" maxlength="2000" placeholder="https://…" class={input} /></label>
		<label class="mt-2 block text-sm"><span class="text-muted">Note (optional)</span><input name="comment" maxlength="10000" placeholder="size, colour, where to buy…" class={input} /></label>
		<div class="mt-2 flex justify-end gap-2">
			<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (adding = false)}>Cancel</button>
			<button disabled={busy || !name.trim()} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40" data-testid="gift-save">{busy ? 'Saving…' : 'Save idea'}</button>
		</div>
	</form>
{:else}
	<button type="button" class="mt-2 text-sm text-accent hover:underline" onclick={() => ((adding = true), queueMicrotask(() => box?.focus()))} data-testid="add-gift">+ Gift idea</button>
{/if}
