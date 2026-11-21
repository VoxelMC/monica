<script lang="ts">
	import { tagCounts } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const counts = $derived(tagCounts(data.contacts, data.tagNames));
	const untagged = $derived(data.contacts.filter((c) => !c.tags.length).length);
	const max = $derived(Math.max(1, ...counts.map((t) => t.count)));
</script>

<svelte:head><title>Tags · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<h1 class="mb-1 pt-2 text-2xl font-semibold">Tags</h1>
	<p class="mb-4 text-sm text-slate-500 dark:text-slate-400">
		{counts.length} tags · tap one to see its people. Renaming and bulk tagging arrive with writes (slice 4).
	</p>

	<ul class="flex flex-col gap-2" data-testid="tag-list">
		{#each counts as t (t.name)}
			<li>
				<a
					href="/contacts?tag={encodeURIComponent(t.name)}"
					class="relative flex min-h-12 items-center justify-between overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900"
				>
					<span class="absolute inset-y-0 left-0 bg-accent-50 dark:bg-slate-800" style:width="{(t.count / max) * 100}%" aria-hidden="true"></span>
					<span class="relative font-medium">{t.name}</span>
					<span class="relative text-sm text-slate-500 tabular-nums dark:text-slate-400">{t.count === 0 ? 'unused' : `${t.count} ${t.count === 1 ? 'person' : 'people'}`}</span>
				</a>
			</li>
		{/each}
		<li>
			<a
				href="/contacts?untagged=1"
				class="flex min-h-12 items-center justify-between rounded-[var(--radius-card)] border border-dashed border-slate-300 px-4 text-slate-600 dark:border-slate-700 dark:text-slate-300"
			>
				<span>Untagged</span>
				<span class="text-sm tabular-nums">{untagged} {untagged === 1 ? 'person' : 'people'}</span>
			</a>
		</li>
	</ul>
</div>
