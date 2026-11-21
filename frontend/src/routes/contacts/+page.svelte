<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import ContactCard from '#lib/components/ContactCard.svelte';
	import {
		allTags,
		clipboardList,
		parseSort,
		parseTagFilter,
		searchContacts,
		sortContacts,
		tagFilterParams,
		type SortKey
	} from '#lib/contacts.js';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// State starts from the URL so search/filter/sort survive reloads and work without JS (GET form).
	const initial = parseTagFilter(page.url.searchParams);
	let query = $state(page.url.searchParams.get('q') ?? '');
	let tags = $state<string[]>(initial.tags);
	let tagMode = $state<'any' | 'all'>(initial.mode);
	let untagged = $state(initial.untagged);
	let sort = $state<SortKey>(parseSort(page.url.searchParams.get('sort')));

	const tagFilter = $derived({ tags, mode: tagMode, untagged });
	const everyTag = $derived(allTags(data.contacts));
	const shown = $derived(sortContacts(searchContacts(data.contacts, query, tagFilter), sort));
	const filtering = $derived(!!query || tags.length > 0 || untagged);

	function toggleTag(t: string) {
		untagged = false;
		tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
	}
	function clearFilters() {
		query = '';
		tags = [];
		untagged = false;
	}

	// ---- Select mode (selection survives filter changes, so it can be built up across searches)
	let selecting = $state(false);
	const selected = new SvelteSet<number>();
	let lastToggled: number | null = null;
	const selectedContacts = $derived(data.contacts.filter((c) => selected.has(c.id)));
	const hiddenSelected = $derived(selectedContacts.length - shown.filter((c) => selected.has(c.id)).length);
	const allShownSelected = $derived(shown.length > 0 && shown.every((c) => selected.has(c.id)));

	function toggle(id: number, shiftKey: boolean) {
		// Shift-click selects a range of the visible list (desktop).
		if (shiftKey && lastToggled !== null) {
			const ids = shown.map((c) => c.id);
			const [a, b] = [ids.indexOf(lastToggled), ids.indexOf(id)].sort((x, y) => x - y);
			if (a >= 0 && b >= 0) {
				const on = !selected.has(id);
				for (const i of ids.slice(a, b + 1)) on ? selected.add(i) : selected.delete(i);
				lastToggled = id;
				return;
			}
		}
		selected.has(id) ? selected.delete(id) : selected.add(id);
		lastToggled = id;
	}
	function toggleAllShown() {
		if (allShownSelected) for (const c of shown) selected.delete(c.id);
		else for (const c of shown) selected.add(c.id);
	}
	function exitSelect() {
		selecting = false;
		selected.clear();
		lastToggled = null;
	}

	// ---- Copy emails / phones
	let toast = $state('');
	let fallbackText = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	function say(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 3500);
	}
	async function copy(kind: 'emails' | 'phones') {
		const { text, count, missing } = clipboardList(selectedContacts, kind);
		if (!count) return say(`None of the selected people have ${kind === 'emails' ? 'an email' : 'a phone number'}.`);
		const note = missing ? ` (${missing} without)` : '';
		try {
			await navigator.clipboard.writeText(text);
			say(`Copied ${count} ${kind === 'emails' ? 'email' : 'phone'}${count === 1 ? '' : 's'}${note}`);
		} catch {
			fallbackText = text; // clipboard blocked: show it for manual copy
		}
	}

	// ---- Keep the URL in sync (no navigation, no history spam)
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const params = new URLSearchParams();
		if (query) params.set('q', query);
		tagFilterParams(tagFilter, params);
		if (sort !== 'name') params.set('sort', sort);
		const qs = params.toString();
		clearTimeout(timer);
		timer = setTimeout(() => {
			if (qs !== page.url.searchParams.toString()) replaceState(qs ? `?${qs}` : page.url.pathname, page.state);
		}, 250);
		return () => clearTimeout(timer);
	});

	const sortLabels: Record<SortKey, string> = { name: 'Name', 'last-contacted': 'Last contacted', recent: 'Recently added' };
	const chip = 'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap';
	const chipOn = 'border-accent-600 bg-accent-600 text-white';
	const chipOff = 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';
</script>

<svelte:head><title>People · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
	<header class="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pt-2 pb-3 backdrop-blur dark:bg-slate-950/95">
		<div class="mb-3 flex items-center justify-between gap-2">
			<h1 class="text-2xl font-semibold">People</h1>
			{#if selecting}
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 font-medium text-accent-700 dark:text-accent-500" onclick={exitSelect}>Done</button>
			{:else}
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-accent-700 dark:text-accent-500" onclick={() => (selecting = true)}>Select</button>
			{/if}
		</div>

		<form method="GET" role="search" class="flex flex-col gap-2" onsubmit={(e) => e.preventDefault()}>
			<div class="flex gap-2">
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
					class="h-12 min-w-0 flex-1 rounded-[var(--radius-input)] border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900"
				/>
				<label>
					<span class="sr-only">Sort by</span>
					<select
						name="sort"
						bind:value={sort}
						class="h-12 rounded-[var(--radius-input)] border border-slate-300 bg-white px-2 text-base dark:border-slate-700 dark:bg-slate-900"
					>
						{#each Object.entries(sortLabels) as [k, label] (k)}<option value={k}>{label}</option>{/each}
					</select>
				</label>
			</div>

			<!-- Tag chips: one tap to filter; several tags combine as any/all. -->
			{#if everyTag.length}
				<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by tag">
					<button type="button" class="{chip} {untagged ? chipOn : chipOff} border-dashed" aria-pressed={untagged} onclick={() => ((untagged = !untagged), (tags = []))}>Untagged</button>
					{#each everyTag as t (t)}
						<button type="button" class="{chip} {tags.includes(t) ? chipOn : chipOff}" aria-pressed={tags.includes(t)} onclick={() => toggleTag(t)}>{t}</button>
					{/each}
				</div>
				<noscript>
					<!-- Without JS: plain checkboxes submitted with the GET form. -->
					<fieldset class="flex flex-wrap gap-2 text-sm">
						{#each everyTag as t (t)}<label><input type="checkbox" name="tag" value={t} checked={tags.includes(t)} /> {t}</label>{/each}
						<button class="rounded bg-accent-600 px-3 text-white">Go</button>
					</fieldset>
				</noscript>
			{/if}
		</form>

		<div class="mt-2 flex min-h-6 items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
			<p aria-live="polite" data-testid="count">
				{shown.length === data.contacts.length ? `${data.contacts.length} people` : `${shown.length} of ${data.contacts.length} people`}
			</p>
			<div class="flex items-center gap-3">
				{#if tags.length > 1}
					<button type="button" class="text-accent-700 dark:text-accent-500" onclick={() => (tagMode = tagMode === 'any' ? 'all' : 'any')} data-testid="tag-mode">
						Match {tagMode === 'any' ? 'any tag' : 'all tags'}
					</button>
				{/if}
				{#if filtering}<button type="button" class="text-accent-700 dark:text-accent-500" onclick={clearFilters}>Clear</button>{/if}
			</div>
		</div>

		{#if selecting}
			<div class="mt-2 flex items-center justify-between gap-2 text-sm">
				<button type="button" class="min-h-9 text-accent-700 dark:text-accent-500" onclick={toggleAllShown} disabled={!shown.length}>
					{allShownSelected ? 'Deselect' : 'Select'} all {shown.length} shown
				</button>
				{#if selected.size}<button type="button" class="min-h-9 text-slate-500" onclick={() => selected.clear()}>Clear selection</button>{/if}
			</div>
		{/if}
	</header>

	{#if shown.length}
		<ul class="flex flex-col gap-2 {selecting ? 'pb-36' : 'pb-4'}">
			{#each shown as c (c.id)}
				<ContactCard contact={c} {selecting} selected={selected.has(c.id)} ontoggle={toggle} />
			{/each}
		</ul>
	{:else if data.contacts.length}
		<div class="py-12 text-center text-slate-500 dark:text-slate-400">
			<p>No one matches{query ? ` “${query}”` : ''}{tags.length ? ` with ${tags.length === 1 ? 'tag' : tagMode === 'all' ? 'all of' : 'any of'} ${tags.join(', ')}` : ''}{untagged ? ' without tags' : ''}.</p>
			<button class="mt-3 min-h-11 rounded-[var(--radius-input)] px-4 text-accent-700 dark:text-accent-500" onclick={clearFilters}>Clear search</button>
		</div>
	{:else}
		<p class="py-12 text-center text-slate-500 dark:text-slate-400">No contacts in Monica yet. Add one in Monica to see it here.</p>
	{/if}
</div>

<!-- Bulk action bar, above the phone tab bar -->
{#if selecting}
	<div
		class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-56 dark:border-slate-800 dark:bg-slate-950/95"
		data-testid="bulk-bar"
	>
		<div class="mx-auto flex max-w-2xl flex-col gap-2">
			<p class="text-sm font-medium" aria-live="polite">
				{selected.size} selected{#if hiddenSelected > 0}<span class="font-normal text-slate-500"> ({hiddenSelected} hidden by filter)</span>{/if}
			</p>
			<div class="flex gap-2 overflow-x-auto [scrollbar-width:none]">
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size} onclick={() => copy('emails')}>Copy emails</button>
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size} onclick={() => copy('phones')}>Copy phones</button>
				<button type="button" class="{chip} {chipOff} opacity-50" disabled title="Arrives with writes (slice 4)">Add tag…</button>
				<button type="button" class="{chip} {chipOff} opacity-50" disabled title="Arrives with writes (slice 4)">Remove tag…</button>
				<button type="button" class="{chip} {chipOff} opacity-50" disabled title="Arrives with writes (slice 4)">Log catch-up…</button>
			</div>
			<p class="text-xs text-slate-500 dark:text-slate-400">Tagging and logging arrive with writes (slice 4).</p>
		</div>
	</div>
{/if}

{#if toast}
	<div class="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-40 mx-auto max-w-sm rounded-[var(--radius-card)] bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900" role="status">
		{toast}
	</div>
{/if}

{#if fallbackText}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Copy list">
		<div class="w-full max-w-lg rounded-t-[var(--radius-card)] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)] dark:bg-slate-900">
			<p class="mb-2 text-sm">Your browser blocked the clipboard. Select the text and copy it:</p>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea readonly autofocus class="h-48 w-full rounded-[var(--radius-input)] border border-slate-300 p-2 text-base dark:border-slate-700 dark:bg-slate-950" onfocus={(e) => e.currentTarget.select()}>{fallbackText}</textarea>
			<button type="button" class="mt-2 min-h-11 w-full rounded-[var(--radius-input)] bg-accent-600 text-white" onclick={() => (fallbackText = '')}>Close</button>
		</div>
	</div>
{/if}
