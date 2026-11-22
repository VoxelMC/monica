<script lang="ts">
	import ConfirmRemove from '#lib/components/ConfirmRemove.svelte';
	import { fullDate, relativeDate } from '#lib/contacts.js';
	import type { DiaryItem } from '#lib/log.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let filter = $state<'all' | 'hangout' | 'journal'>('all');
	const shown = $derived(filter === 'all' ? data.items : data.items.filter((i) => i.kind === filter));
	let removing = $state<DiaryItem | null>(null);
	let notice = $state<{ ok: boolean; message: string } | null>(null);
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

	{#if notice}
		<p class="mb-3 rounded-[var(--radius-card)] border p-3 text-sm {notice.ok ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-attention text-attention'}" role="status" data-testid="remove-notice">
			{notice.message} <a class="underline" href="/audit">Audit log</a>
		</p>
	{/if}

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
					<div class="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					{#if data.monicaUrl}
						<p class="text-xs text-muted">
							Edit in Monica:
							{#if item.kind === 'journal'}
								<a class="underline underline-offset-2" href="{data.monicaUrl}/journal" target="_blank" rel="noopener noreferrer">Journal ↗</a>
							{:else}
								{#each item.people.filter((p) => p.hashId) as p, i (p.id)}<a class="underline underline-offset-2" href="{data.monicaUrl}/people/{encodeURIComponent(p.hashId!)}" target="_blank" rel="noopener noreferrer">{p.name} ↗</a>{i < item.people.length - 1 ? ' · ' : ''}{/each}
							{/if}
						</p>
					{/if}
					{#if item.updatedAt}
						<button type="button" class="ml-auto text-xs text-attention underline-offset-2 hover:underline" onclick={() => ((removing = item), (notice = null))}>Remove…</button>
					{/if}
					</div>
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

{#if removing}
	<ConfirmRemove
		kind={removing.kind === 'journal' ? 'journal' : 'activity'}
		id={removing.id}
		updatedAt={removing.updatedAt ?? ''}
		title={removing.title}
		details={[fullDate(removing.date), removing.people.map((p) => p.name).join(', '), removing.body ?? '']}
		warning={removing.kind === 'hangout' && removing.people.length > 1 ? `It disappears for all ${removing.people.length} people who were there. Notes written about them stay.` : removing.kind === 'hangout' ? 'Notes written about them stay.' : ''}
		onclose={() => (removing = null)}
		ondone={(r) => ((notice = r), (removing = null))}
	/>
{/if}
