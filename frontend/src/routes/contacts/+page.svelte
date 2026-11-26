<script lang="ts">
	import RefreshButton from '#lib/components/RefreshButton.svelte';
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import ContactCard from '#lib/components/ContactCard.svelte';
	import {
		allTags,
		clipboardList,
		groupByLetter,
		LETTERS,
		parseSort,
		parseTagFilter,
		searchContacts,
		sortContacts,
		tagFilterParams,
		type SortKey
	} from '#lib/contacts.js';
	import Tag from '#lib/components/Tag.svelte';
	import { type PeopleView } from '#lib/prefs.js';
	import { updatePrefs } from '#lib/prefs-client.js';
	import { useTagHue } from '#lib/tag-colours.js';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tagHue = useTagHue();

	// State starts from the URL so search/filter/sort survive reloads and work without JS (GET form).
	const initial = parseTagFilter(page.url.searchParams);
	let query = $state(page.url.searchParams.get('q') ?? '');
	let tags = $state<string[]>(initial.tags);
	let tagMode = $state<'any' | 'all'>(initial.mode);
	let untagged = $state(initial.untagged);
	let sort = $state<SortKey>(parseSort(page.url.searchParams.get('sort')));

	const tagFilter = $derived({ tags, mode: tagMode, untagged });
	const everyTag = $derived(allTags(data.contacts));
	// Active chips first, so a filter set from a link (e.g. the Tags page) is visible without scrolling.
	const chipOrder = $derived([...tags.filter((t) => everyTag.includes(t)), ...everyTag.filter((t) => !tags.includes(t))]);
	// Same name more than once (the Duplicates page checks properly and plans merges)
	const dupNames = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const c of data.contacts) {
			const k = [c.firstName, c.lastName].map((p) => (p ?? '').trim().toLocaleLowerCase()).filter(Boolean).join(' ');
			if (k) seen.set(k, (seen.get(k) ?? 0) + 1);
		}
		return [...seen.values()].filter((n) => n > 1).length;
	});
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

	// ---- Bulk tags: add or remove one tag on the selection (guarded writes, confirmed first)
	let tagSheet = $state<'add' | 'remove' | null>(null);
	let tagName = $state('');
	let tagBusy = $state(false);
	const fold2 = (s: string) => s.trim().toLocaleLowerCase();
	const tagsInSelection = $derived(allTags(selectedContacts));
	const affected = $derived(
		tagName.trim()
			? selectedContacts.filter((c) => {
					const has = c.tags.some((t) => fold2(t) === fold2(tagName));
					return tagSheet === 'add' ? !has : has;
				})
			: []
	);
	const tagDraft = $derived(JSON.stringify({ mode: tagSheet ?? 'add', contactIds: selectedContacts.map((c) => c.id), tag: tagName }));
	function openTagSheet(mode: 'add' | 'remove') {
		tagSheet = mode;
		tagName = '';
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

	// ---- Cards or lines (remembered per device in the prefs cookie)
	let view = $state<PeopleView>(untrack(() => data.prefs.peopleView));
	function setView(v: PeopleView) {
		view = v;
		updatePrefs({ ...data.prefs, peopleView: v });
	}

	// ---- Letter groups and the A–Z index (when sorted by name)
	const groups = $derived(sort === 'name' ? groupByLetter(shown) : [{ letter: '', contacts: shown }]);
	const present = $derived(new Set(groups.map((g) => g.letter)));
	function jump(letter: string) {
		document.getElementById(`letter-${letter}`)?.scrollIntoView({ block: 'start' });
	}
	// Drag along the index on a phone to scrub through letters.
	let bubble = $state<{ letter: string; y: number } | null>(null);
	function scrub(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.type === 'pointermove' && !e.buttons) return;
		const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
		const l = el?.dataset.letter;
		if (l && present.has(l)) {
			jump(l);
			bubble = { letter: l, y: e.clientY };
		}
	}
	const endScrub = () => setTimeout(() => (bubble = null), 350);
	const tagCountsMap = $derived(
		data.contacts.reduce<Record<string, number>>((acc, c) => {
			for (const t of c.tags) acc[t] = (acc[t] ?? 0) + 1;
			return acc;
		}, {})
	);
	const untaggedCount = $derived(data.contacts.filter((c) => !c.tags.length).length);

	const sortLabels: Record<SortKey, string> = { name: 'Name', 'last-contacted': 'Last contacted', recent: 'Recently added' };
	const chip = 'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-chip)] border px-2.5 text-sm whitespace-nowrap';
	const chipOn = 'border-accent-solid bg-accent-solid text-on-accent';
	const chipOff = 'border-control bg-surface text-fg';
</script>

<svelte:head><title>People · orbit</title></svelte:head>

{#snippet tagRow(label: string, count: number, on: boolean, onclick: () => void, hue?: number)}
	<li>
		<button
			type="button"
			aria-pressed={on}
			class="flex min-h-8 w-full items-center gap-2 rounded-[var(--radius-input)] px-2 text-left text-sm {on ? 'bg-accent-soft font-semibold text-on-accent-soft' : 'hover:bg-surface-2'}"
			{onclick}
		>
			{#if hue}<span class="size-2 shrink-0 rounded-[2px]" style:background-color="var(--hue-{hue})" aria-hidden="true"></span>{:else}<span class="size-2 shrink-0 rounded-[2px] border border-control" aria-hidden="true"></span>{/if}
			<span class="min-w-0 flex-1 truncate">{label}</span>
			<span class="text-xs text-muted tabular">{count}</span>
		</button>
	</li>
{/snippet}

<div class="px-4 lg:flex lg:p-0">
	<!-- Desktop: tags in their own column -->
	<!-- Desktop: a second sidebar for tags, right next to the main one -->
	<aside class="sticky top-0 hidden h-dvh w-52 shrink-0 overflow-y-auto border-r border-line px-3 pt-6 pb-6 lg:block" aria-label="Filter by tag">
		<h2 class="mb-3 px-2 text-lg font-semibold">Tags</h2>
		<ul class="flex flex-col gap-px">
			{@render tagRow('Everyone', data.contacts.length, !tags.length && !untagged, () => ((tags = []), (untagged = false)))}
			{#each everyTag as t (t)}
				{@render tagRow(t, tagCountsMap[t] ?? 0, tags.includes(t), () => toggleTag(t), tagHue(t))}
			{/each}
			{@render tagRow('Untagged', untaggedCount, untagged, () => ((untagged = !untagged), (tags = [])))}
		</ul>
		{#if tags.length > 1}
			<button type="button" class="mt-3 px-2 text-sm text-accent" onclick={() => (tagMode = tagMode === 'any' ? 'all' : 'any')} data-testid="tag-mode">
				Match {tagMode === 'any' ? 'any tag' : 'all tags'}
			</button>
		{/if}
		<a href="/tags" class="mt-4 block px-2 text-sm text-muted underline-offset-2 hover:underline">All tags →</a>
	</aside>

	<div class="min-w-0 lg:flex-1 lg:px-8">
		<div class="lg:max-w-5xl">
		<!-- Top padding lives inside the sticky header, so it never moves when scrolling starts -->
		<header class="sticky top-0 z-10 -mx-4 border-b border-line bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2.5 lg:mx-0 lg:px-0 lg:pt-5">
			<div class="mb-2.5 flex items-center justify-between gap-2">
				<h1 class="text-2xl font-semibold">People <span class="text-base font-normal text-muted tabular" data-testid="count">{shown.length === data.contacts.length ? data.contacts.length : `${shown.length} of ${data.contacts.length}`}</span></h1>
				<div class="flex h-9 items-center gap-2">
					<RefreshButton compact />
					<div class="flex h-9 items-center gap-0.5 rounded-[var(--radius-input)] border border-control p-0.5" role="group" aria-label="View">
						{#each [['cards', 'Cards', 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'], ['lines', 'Lines', 'M3 6h18M3 12h18M3 18h18'], ['photos', 'Photos', 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01']] as [v, label, icon] (v)}
							<button
								type="button"
								aria-pressed={view === v}
								aria-label={label}
								title={label}
								class="flex h-full w-8 items-center justify-center rounded-[var(--radius-chip)] {view === v ? 'bg-accent-solid text-on-accent' : 'text-muted hover:text-fg'}"
								onclick={() => setView(v as PeopleView)}
							>
								<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d={icon} /></svg>
							</button>
						{/each}
					</div>
					{#if selecting}
						<button type="button" class="h-9 rounded-[var(--radius-input)] px-3 font-semibold text-accent hover:bg-surface-2" onclick={exitSelect}>Done</button>
					{:else}
						<button type="button" class="h-9 rounded-[var(--radius-input)] px-3 text-accent hover:bg-surface-2" onclick={() => (selecting = true)}>Select</button>
					{/if}
				</div>
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
						class="h-10 min-w-0 flex-1 rounded-[var(--radius-input)] border border-control bg-surface px-3"
					/>
					<label>
						<span class="sr-only">Sort by</span>
						<select name="sort" bind:value={sort} class="h-10 rounded-[var(--radius-input)] border border-control bg-surface px-2">
							{#each Object.entries(sortLabels) as [k, label] (k)}<option value={k}>{label}</option>{/each}
						</select>
					</label>
				</div>

				<!-- Phone: tag chips (desktop has the tag column) -->
				{#if everyTag.length}
					<div class="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden" role="group" aria-label="Filter by tag">
						<button type="button" class="{chip} {untagged ? chipOn : chipOff} border-dashed" aria-pressed={untagged} onclick={() => ((untagged = !untagged), (tags = []))}>Untagged</button>
						{#each chipOrder as t (t)}
							<button type="button" class="{chip} {tags.includes(t) ? chipOn : chipOff}" aria-pressed={tags.includes(t)} onclick={() => toggleTag(t)}>
								<span class="size-1.5 rounded-[1px]" style:background-color={tags.includes(t) ? 'currentColor' : `var(--hue-${tagHue(t)})`} aria-hidden="true"></span>{t}
							</button>
						{/each}
					</div>
					<noscript>
						<fieldset class="flex flex-wrap gap-2 text-sm">
							{#each everyTag as t (t)}<label><input type="checkbox" name="tag" value={t} checked={tags.includes(t)} /> {t}</label>{/each}
							<button class="rounded bg-accent-solid px-3 text-on-accent">Go</button>
						</fieldset>
					</noscript>
				{/if}
			</form>

			{#if filtering || (tags.length > 1) || selecting}
				<div class="mt-2 flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
					{#if tags.length > 1}
						<button type="button" class="text-accent lg:hidden" onclick={() => (tagMode = tagMode === 'any' ? 'all' : 'any')}>Match {tagMode === 'any' ? 'any tag' : 'all tags'}</button>
					{/if}
					{#if filtering}<button type="button" class="text-accent" onclick={clearFilters}>Clear filters</button>{/if}
					{#if selecting}
						<button type="button" class="text-accent" onclick={toggleAllShown} disabled={!shown.length}>{allShownSelected ? 'Deselect' : 'Select'} all {shown.length} shown</button>
						{#if selected.size}<button type="button" class="text-muted" onclick={() => selected.clear()}>Clear selection</button>{/if}
					{/if}
				</div>
			{/if}
		</header>
		{#if dupNames}
			<a href="/duplicates" class="mt-3 flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2 text-sm hover:bg-surface-2" data-testid="dup-banner">
				<span>{dupNames} {dupNames === 1 ? 'name appears' : 'names appear'} more than once</span>
				<span class="font-medium text-accent">Review duplicates →</span>
			</a>
		{/if}

		<div class="relative pr-6 lg:pr-8">
			{#if shown.length}
				<div class="{selecting ? 'pb-40' : 'pb-6'}">
					{#each groups as g (g.letter)}
						<section aria-labelledby={g.letter ? `letter-${g.letter}` : undefined}>
							{#if g.letter}
								<h2 id="letter-{g.letter}" class="scroll-mt-40 pt-3 pb-1 text-sm font-semibold text-muted lg:scroll-mt-32">{g.letter}</h2>
							{/if}
							<ul class={view === 'cards' ? 'grid gap-2 sm:grid-cols-2 xl:grid-cols-3' : view === 'photos' ? 'grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'border-y border-line'}>
								{#each g.contacts as c (c.id)}
									<ContactCard contact={c} {view} {selecting} selected={selected.has(c.id)} ontoggle={toggle} />
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			{:else if data.contacts.length}
				<div class="py-12 text-center text-muted">
					<p>No one matches{query ? ` “${query}”` : ''}{tags.length ? ` with ${tags.length === 1 ? 'tag' : tagMode === 'all' ? 'all of' : 'any of'} ${tags.join(', ')}` : ''}{untagged ? ' without tags' : ''}.</p>
					<button class="mt-3 min-h-11 px-4 text-accent" onclick={clearFilters}>Clear search</button>
				</div>
			{:else}
				<p class="py-12 text-center text-muted">No contacts in Monica yet. Add one in Monica to see it here.</p>
			{/if}

			<!-- A–Z index: tap or drag to jump (only when sorted by name) -->
			{#if sort === 'name' && shown.length > 8}
				<nav
					class="fixed top-[13.5rem] right-0.5 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex touch-none flex-col items-center justify-between select-none lg:top-40 lg:right-2 lg:bottom-10"
					aria-label="Jump to letter"
					onpointerdown={scrub}
					onpointermove={scrub}
					onpointerup={endScrub}
					onpointercancel={endScrub}
					onpointerleave={endScrub}
					data-testid="az-index"
				>
					{#each LETTERS as l (l)}
						<button
							type="button"
							data-letter={l}
							disabled={!present.has(l)}
							class="flex min-h-0 w-6 flex-1 items-center justify-center rounded-[var(--radius-chip)] text-[0.68rem] leading-none font-semibold transition-[background-color,color,transform] duration-100 {present.has(l) ? 'text-accent hover:scale-125 hover:bg-accent-solid hover:text-on-accent' : 'cursor-default text-muted opacity-40'} {bubble?.letter === l ? 'bg-accent-solid text-on-accent' : ''}"
							onclick={() => jump(l)}
							aria-label="Jump to {l}"
						>{l}</button>
					{/each}
				</nav>
				{#if bubble}
					<div
						class="pointer-events-none fixed right-10 z-20 flex size-14 -translate-y-1/2 items-center justify-center rounded-[var(--radius-photo-lg)] bg-accent-solid text-2xl font-semibold text-on-accent shadow-lg lg:right-12"
						style:top="{bubble.y}px"
						aria-hidden="true"
					>
						{bubble.letter}
					</div>
				{/if}
			{/if}
		</div>
		</div>
	</div>
</div>

<!-- Bulk action bar, above the phone tab bar -->
{#if selecting}
	<div
		class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface px-4 py-3 lg:bottom-0 lg:left-56"
		data-testid="bulk-bar"
	>
		<div class="mx-auto flex max-w-2xl flex-col gap-2">
			<p class="text-sm font-medium" aria-live="polite">
				{selected.size} selected{#if hiddenSelected > 0}<span class="font-normal text-muted"> ({hiddenSelected} hidden by filter)</span>{/if}
			</p>
			<div class="flex gap-2 overflow-x-auto [scrollbar-width:none]">
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size} onclick={() => copy('emails')}>Copy emails</button>
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size} onclick={() => copy('phones')}>Copy phones</button>
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size} onclick={() => openTagSheet('add')}>Add tag…</button>
				<button type="button" class="{chip} {chipOff}" disabled={!selected.size || !tagsInSelection.length} onclick={() => openTagSheet('remove')}>Remove tag…</button>
				<a href="/log?people={[...selected].join(',')}" class="{chip} {chipOff}" aria-disabled={!selected.size}>Log catch-up…</a>
			</div>
			{#if data.readOnly}<p class="text-xs text-muted">orbit is read-only right now, so tag changes will be refused.</p>{/if}
		</div>
	</div>
{/if}

{#if toast}
	<div class="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-40 mx-auto max-w-sm rounded-[var(--radius-card)] bg-fg px-4 py-3 text-sm text-bg shadow-lg" role="status">
		{toast}
	</div>
{/if}

{#if fallbackText}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Copy list">
		<div class="w-full max-w-lg rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<p class="mb-2 text-sm">Your browser blocked the clipboard. Select the text and copy it:</p>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea readonly autofocus class="h-48 w-full rounded-[var(--radius-input)] border border-control p-2 text-base" onfocus={(e) => e.currentTarget.select()}>{fallbackText}</textarea>
			<button type="button" class="mt-2 min-h-11 w-full rounded-[var(--radius-input)] bg-accent-solid text-on-accent" onclick={() => (fallbackText = '')}>Close</button>
		</div>
	</div>
{/if}

{#if tagSheet}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="tag-sheet-h">
		<div class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<h2 id="tag-sheet-h" class="text-lg font-semibold">{tagSheet === 'add' ? 'Add a tag' : 'Remove a tag'} · {selected.size} selected</h2>
			{#if tagSheet === 'add'}
				<label class="mt-3 block text-sm font-medium" for="tag-name">Tag</label>
				<input id="tag-name" class="mt-1 h-10 w-full rounded-[var(--radius-input)] border border-control bg-surface px-3" placeholder="Pick below or type a new one" bind:value={tagName} autocomplete="off" />
			{/if}
			<div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Tags">
				{#each tagSheet === 'add' ? everyTag : tagsInSelection as t (t)}
					<button type="button" aria-pressed={fold2(tagName) === fold2(t)} class="{chip} {fold2(tagName) === fold2(t) ? chipOn : chipOff}" onclick={() => (tagName = t)}>
						<span class="size-1.5 rounded-[1px]" style:background-color={fold2(tagName) === fold2(t) ? 'currentColor' : `var(--hue-${tagHue(t)})`} aria-hidden="true"></span>{t}
					</button>
				{/each}
			</div>
			{#if tagName.trim()}
				<div class="mt-4 rounded-[var(--radius-input)] border border-line bg-surface-2 p-3 text-sm" data-testid="tag-preview">
					{#if affected.length}
						<p class="font-semibold">{tagSheet === 'add' ? 'Add' : 'Remove'} “{tagName.trim()}” {tagSheet === 'add' ? 'to' : 'from'} {affected.length} {affected.length === 1 ? 'person' : 'people'}:</p>
						<p class="mt-1 text-muted">{affected.map((c) => c.name).join(', ')}</p>
						{#if selected.size - affected.length}<p class="mt-1 text-muted">{selected.size - affected.length} skipped ({tagSheet === 'add' ? 'already have it' : "don't have it"}).</p>{/if}
						<p class="mt-2 text-xs text-muted">One request per person ({tagSheet === 'add' ? 'POST /api/contacts/{id}/setTags' : 'POST /api/contacts/{id}/unsetTag'}).{tagSheet === 'remove' ? ' The tag itself stays in Monica.' : ''}</p>
					{:else}
						<p class="text-muted">{tagSheet === 'add' ? 'Everyone selected already has this tag.' : 'No one selected has this tag.'}</p>
					{/if}
				</div>
			{/if}
			<form
				method="POST"
				action="?/tags"
				use:enhance={() => {
					tagBusy = true;
					return async ({ result, update }) => {
						tagBusy = false;
						const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
						say(d?.message ?? 'Something went wrong; check the audit log.');
						if (d?.ok) tagSheet = null;
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="draft" value={tagDraft} />
				<button type="submit" disabled={!affected.length || tagBusy} class="mt-4 h-11 w-full rounded-[var(--radius-input)] font-semibold disabled:opacity-40 {tagSheet === 'add' ? 'bg-accent-solid text-on-accent' : 'bg-attention text-surface'}">
					{tagBusy ? 'Saving…' : affected.length ? `${tagSheet === 'add' ? 'Add to' : 'Remove from'} ${affected.length} ${affected.length === 1 ? 'person' : 'people'}` : tagSheet === 'add' ? 'Add' : 'Remove'}
				</button>
			</form>
			<button type="button" disabled={tagBusy} class="mt-2 h-11 w-full rounded-[var(--radius-input)] border border-control" onclick={() => (tagSheet = null)}>Cancel</button>
		</div>
	</div>
{/if}
