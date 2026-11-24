<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let creating = $state(false);
	const today = new Date().toISOString().slice(0, 10);
	const when = (t: { startDate: string | null; endDate: string | null }) =>
		[t.startDate, t.endDate].filter(Boolean).join(' → ') || 'no dates';
	const upcoming = $derived(data.trips.filter((t) => !t.endDate || t.endDate >= today));
	const past = $derived(data.trips.filter((t) => t.endDate && t.endDate < today));
	const input = 'mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3';
</script>

<svelte:head><title>Trips · orbit</title></svelte:head>

{#snippet list(items: typeof data.trips)}
	<ul class="flex flex-col gap-2">
		{#each items as t (t.id)}
			{@const left = t.people.filter((p) => !p.done).length}
			<li>
				<a href="/trips/{t.id}" class="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 hover:border-control">
					<span class="min-w-0">
						<span class="block truncate font-semibold">{t.name}</span>
						<span class="block truncate text-sm text-muted">{[t.destination, when(t)].filter(Boolean).join(' · ')}</span>
					</span>
					<span class="shrink-0 text-sm {left ? 'text-attention' : 'text-muted'}">{t.people.length ? (left ? `${left} to get` : 'all done ✓') : 'no one yet'}</span>
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<div class="flex items-center justify-between pt-2 pb-1">
		<h1 class="text-2xl font-semibold">Trips</h1>
		{#if !creating}<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 font-medium text-accent hover:bg-surface-2" onclick={() => (creating = true)} data-testid="new-trip">+ New trip</button>{/if}
	</div>
	<p class="mb-4 text-sm text-muted">Who to bring something back for. Kept in orbit.</p>

	{#if creating}
		<form method="POST" action="?/create" use:enhance class="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="trip-form">
			<label class="block text-sm"><span class="text-muted">Trip</span><input name="name" required maxlength="80" placeholder="e.g. Christmas in Lyon" class={input} /></label>
			<label class="mt-2 block text-sm"><span class="text-muted">Where (optional)</span><input name="destination" maxlength="120" class={input} /></label>
			<div class="mt-2 grid grid-cols-2 gap-2">
				<label class="block text-sm"><span class="text-muted">From</span><input name="startDate" type="date" class={input} /></label>
				<label class="block text-sm"><span class="text-muted">To</span><input name="endDate" type="date" class={input} /></label>
			</div>
			{#if form && !form.ok}<p class="mt-2 text-sm text-attention" role="alert">{form.message}</p>{/if}
			<div class="mt-3 flex justify-end gap-2">
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (creating = false)}>Cancel</button>
				<button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent" data-testid="trip-create">Create trip</button>
			</div>
		</form>
	{/if}

	{#if upcoming.length}<h2 class="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Coming up</h2>{@render list(upcoming)}{/if}
	{#if past.length}<h2 class="mt-5 mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Past</h2>{@render list(past)}{/if}
	{#if !data.trips.length && !creating}
		<p class="rounded-[var(--radius-card)] border border-dashed border-control p-6 text-center text-sm text-muted">No trips yet.</p>
	{/if}
</div>
