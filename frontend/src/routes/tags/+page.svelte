<script lang="ts">
	import { tagCounts } from '#lib/contacts.js';
	import { tagHue } from '#lib/themes.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const counts = $derived(tagCounts(data.contacts, data.tagNames));
	const untagged = $derived(data.contacts.filter((c) => !c.tags.length).length);
	const max = $derived(Math.max(1, ...counts.map((t) => t.count)));
</script>

<svelte:head><title>Tags · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<h1 class="mb-1 pt-2 text-2xl font-semibold">Tags</h1>
	<p class="mb-4 text-sm text-muted">
		{counts.length} tags · tap one to see its people. Renaming and bulk tagging arrive with writes (slice 4).
	</p>

	<ul class="flex flex-col gap-2" data-testid="tag-list">
		{#each counts as t (t.name)}
			<li>
				<a
					href="/contacts?tag={encodeURIComponent(t.name)}"
					class="relative flex min-h-12 items-center justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface px-4"
				>
					<span class="absolute inset-y-0 left-0" style:background-color="var(--tag-{tagHue(t.name)}-bg)" style:width="{(t.count / max) * 100}%" aria-hidden="true"></span>
					<span class="relative flex items-center gap-2 font-semibold"><span class="size-2.5 rounded-[2px]" style:background-color="var(--hue-{tagHue(t.name)})" aria-hidden="true"></span>{t.name}</span>
					<span class="relative text-sm text-muted tabular-nums">{t.count === 0 ? 'unused' : `${t.count} ${t.count === 1 ? 'person' : 'people'}`}</span>
				</a>
			</li>
		{/each}
		<li>
			<a
				href="/contacts?untagged=1"
				class="flex min-h-12 items-center justify-between rounded-[var(--radius-card)] border border-dashed border-control px-4 text-muted"
			>
				<span>Untagged</span>
				<span class="text-sm tabular-nums">{untagged} {untagged === 1 ? 'person' : 'people'}</span>
			</a>
		</li>
	</ul>
</div>
