<script lang="ts">
	import { fullDate, relativeDate, type ContactCard } from '#lib/contacts.js';
	import Avatar from './Avatar.svelte';

	let { contact: c }: { contact: ContactCard } = $props();
</script>

<li data-testid="contact-card">
<a
	href="/contacts/{c.id}"
	class="flex min-h-[4.5rem] items-center gap-3 rounded-[var(--radius-card)] border border-slate-200 bg-white p-3 hover:border-accent-500 active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800"
>
	<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} />
	<div class="min-w-0 flex-1">
		<p class="truncate font-medium">
			{c.name}
			{#if c.nickname}<span class="font-normal text-slate-500 dark:text-slate-400">“{c.nickname}”</span>{/if}
		</p>
		<p class="truncate text-sm text-slate-500 dark:text-slate-400">
			{#if c.lastContacted}
				<time datetime={c.lastContacted} title={fullDate(c.lastContacted)}>Last contact {relativeDate(c.lastContacted)}</time>
			{:else}
				No catch-ups logged
			{/if}
		</p>
		{#if c.tags.length}
			<ul class="mt-1 flex flex-wrap gap-1" aria-label="Tags">
				{#each c.tags as t (t)}
					<li class="rounded-full bg-accent-50 px-2 py-0.5 text-xs text-accent-700 dark:bg-slate-800 dark:text-accent-500">{t}</li>
				{/each}
			</ul>
		{/if}
	</div>
</a>
</li>
