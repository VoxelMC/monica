<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import ContactCard from '#lib/components/ContactCard.svelte';
	import { allTags, parseSort, searchContacts, sortContacts, type SortKey } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// State starts from the URL so search/filter/sort survive reloads and work without JS (GET form).
	let query = $state(page.url.searchParams.get('q') ?? '');
	let tag = $state(page.url.searchParams.get('tag') ?? '');
	let sort = $state<SortKey>(parseSort(page.url.searchParams.get('sort')));

	const tags = $derived(allTags(data.contacts));
	const shown = $derived(sortContacts(searchContacts(data.contacts, query, tag || null), sort));

	// Keep the URL in sync (no navigation, no history spam).
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		if (tag) params.set('tag', tag);
		if (sort !== 'name') params.set('sort', sort);
		const qs = params.toString();
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (qs !== page.url.searchParams.toString()) replaceState(qs ? `?${qs}` : page.url.pathname, page.state);
		}, 250);
		return () => clearTimeout(timer);
	});

	const sortLabels: Record<SortKey, string> = { name: 'Name', 'last-contacted': 'Last contacted', recent: 'Recently added' };
</script>

<svelte:head><title>People · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
	<header class="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pt-2 pb-3 backdrop-blur dark:bg-slate-950/95">
		<h1 class="mb-3 text-2xl font-semibold">People</h1>
		<form method="GET" role="search" class="flex flex-col gap-2" onsubmit={(e) => e.preventDefault()}>
			<label class="sr-only" for="q">Search people</label>
			<input
				id="q"
				name="q"
				type="search"
				inputmode="search"
				autocomplete="off"
				enterkeyhint="search"
				placeholder="Name, nickname, email or phone"
				bind:value={query}
				class="h-12 w-full rounded-[var(--radius-input)] border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900"
			/>
			<div class="flex gap-2">
				<label class="flex-1">
					<span class="sr-only">Filter by tag</span>
					<select
						name="tag"
						bind:value={tag}
						class="h-11 w-full rounded-[var(--radius-input)] border border-slate-300 bg-white px-2 text-base dark:border-slate-700 dark:bg-slate-900"
					>
						<option value="">All tags</option>
						{#each tags as t (t)}<option value={t}>{t}</option>{/each}
					</select>
				</label>
				<label class="flex-1">
					<span class="sr-only">Sort by</span>
					<select
						name="sort"
						bind:value={sort}
						class="h-11 w-full rounded-[var(--radius-input)] border border-slate-300 bg-white px-2 text-base dark:border-slate-700 dark:bg-slate-900"
					>
						{#each Object.entries(sortLabels) as [k, label] (k)}<option value={k}>{label}</option>{/each}
					</select>
				</label>
				<noscript><button class="h-11 rounded-[var(--radius-input)] bg-accent-600 px-4 text-white">Go</button></noscript>
			</div>
		</form>
		<p class="mt-2 text-sm text-slate-500 dark:text-slate-400" aria-live="polite" data-testid="count">
			{shown.length === data.contacts.length ? `${data.contacts.length} people` : `${shown.length} of ${data.contacts.length} people`}
		</p>
	</header>

	{#if shown.length}
		<ul class="flex flex-col gap-2 pb-4">
			{#each shown as c (c.id)}<ContactCard contact={c} />{/each}
		</ul>
	{:else if data.contacts.length}
		<div class="py-12 text-center text-slate-500 dark:text-slate-400">
			<p>No one matches “{query}”{tag ? ` with tag ${tag}` : ''}.</p>
			<button class="mt-3 min-h-11 rounded-[var(--radius-input)] px-4 text-accent-700 dark:text-accent-500" onclick={() => ((query = ''), (tag = ''))}>
				Clear search
			</button>
		</div>
	{:else}
		<p class="py-12 text-center text-slate-500 dark:text-slate-400">No contacts in Monica yet. Add one in Monica to see it here.</p>
	{/if}
</div>
