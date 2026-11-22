<script lang="ts">
	import { fullDate, relativeDate } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let filter = $state<'all' | 'hangout' | 'journal'>('all');
	const shown = $derived(filter === 'all' ? data.items : data.items.filter((i) => i.kind === filter));
	const chip = 'inline-flex min-h-9 items-center rounded-[var(--radius-chip)] border px-3 text-sm';
</script>

<svelte:head><title>Diary · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<div class="flex items-center justify-between pt-2">
		<h1 class="text-2xl font-semibold">Diary</h1>
		<a href="/log" class="inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-3 text-accent">+ Log</a>
	</div>
	<div class="my-3 flex gap-2" role="group" aria-label="Show">
		{#each [['all', 'All'], ['hangout', 'Hangouts'], ['journal', 'Journal']] as [k, label] (k)}
			<button
				type="button"
				aria-pressed={filter === k}
				class="{chip} {filter === k ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-control bg-surface'}"
				onclick={() => (filter = k as typeof filter)}>{label}</button
			>
		{/each}
	</div>

	{#if shown.length}
		<ol class="flex flex-col gap-2" data-testid="diary">
			{#each shown as item (item.kind + item.id)}
				<li class="rounded-[var(--radius-card)] border border-line bg-surface p-4">
					<div class="flex items-baseline justify-between gap-2">
						<p class="font-medium">{item.title}</p>
						<time class="shrink-0 text-sm text-muted" datetime={item.date} title={fullDate(item.date)}>{relativeDate(item.date)}</time>
					</div>
					<p class="text-sm text-muted">{item.kind === 'journal' ? 'Journal' : (item.type ?? 'Hangout')}</p>
					{#if item.people.length}
						<p class="mt-1 text-sm">
							{#each item.people as p, i (p.id)}<a href="/contacts/{p.id}" class="text-accent">{p.name}</a>{i < item.people.length - 1 ? ', ' : ''}{/each}
						</p>
					{/if}
					{#if item.body}<p class="mt-2 text-sm break-words whitespace-pre-line">{item.body}</p>{/if}
					{#if data.monicaUrl}
						<!-- orbit never deletes; edit or remove entries in Monica -->
						<p class="mt-2 text-xs text-muted">
							Edit or remove in Monica:
							{#if item.kind === 'journal'}
								<a class="underline underline-offset-2" href="{data.monicaUrl}/journal" target="_blank" rel="noopener noreferrer">Journal ↗</a>
							{:else}
								{#each item.people.filter((p) => p.hashId) as p, i (p.id)}<a class="underline underline-offset-2" href="{data.monicaUrl}/people/{encodeURIComponent(p.hashId!)}" target="_blank" rel="noopener noreferrer">{p.name} ↗</a>{i < item.people.length - 1 ? ' · ' : ''}{/each}
							{/if}
						</p>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		<div class="py-12 text-center text-muted">
			<p>{filter === 'journal' ? 'No journal entries yet.' : filter === 'hangout' ? 'No hangouts logged yet.' : 'Nothing in the diary yet.'}</p>
			<a href="/log" class="mt-3 inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-4 text-accent">Log one</a>
		</div>
	{/if}
</div>
