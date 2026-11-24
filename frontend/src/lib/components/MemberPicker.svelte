<script lang="ts">
	// Pick people for a friend group: search, tick, and the picks go into the form as
	// `member` fields. Picked people are listed first.
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import Avatar from './Avatar.svelte';
	import type { ContactCard } from '#lib/contacts.js';

	let { contacts, initial = [] }: { contacts: ContactCard[]; initial?: number[] } = $props();
	const picked = new SvelteSet<number>(untrack(() => initial)); // starts from the current members
	let q = $state('');
	const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
	const shown = $derived.by(() => {
		const n = norm(q.trim());
		const list = n ? contacts.filter((c) => norm(c.name + ' ' + (c.nickname ?? '')).includes(n)) : contacts;
		return [...list].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)) || a.name.localeCompare(b.name)).slice(0, 60);
	});
</script>

{#each [...picked] as id (id)}<input type="hidden" name="member" value={id} />{/each}
<input bind:value={q} type="search" placeholder="Search people" aria-label="Search people" class="block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3" />
<p class="mt-1 text-xs text-muted" data-testid="picked-count">{picked.size} picked</p>
<ul class="mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-input)] border border-line" data-testid="member-picker">
	{#each shown as c (c.id)}
		<li>
			<label class="flex min-h-12 cursor-pointer items-center gap-3 px-3 hover:bg-surface-2">
				<input type="checkbox" class="size-5 accent-[var(--accent-solid)]" checked={picked.has(c.id)} onchange={(e) => ((e.currentTarget as HTMLInputElement).checked ? picked.add(c.id) : picked.delete(c.id))} />
				<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} photoKey={c.photoKey} size="size-8" text="text-xs" />
				<span class="truncate">{c.name}</span>
			</label>
		</li>
	{/each}
</ul>
