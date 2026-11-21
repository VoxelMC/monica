<script lang="ts">
	import { fullDate, relativeDate, type ContactCard } from '#lib/contacts.js';
	import Avatar from './Avatar.svelte';

	interface Props {
		contact: ContactCard;
		/** In select mode the whole card toggles selection instead of opening the contact. */
		selecting?: boolean;
		selected?: boolean;
		ontoggle?: (id: number, shiftKey: boolean) => void;
	}
	let { contact: c, selecting = false, selected = false, ontoggle }: Props = $props();

	const base =
		'flex min-h-[4.5rem] w-full items-center gap-3 rounded-[var(--radius-card)] border bg-white p-3 text-left dark:bg-slate-900';
</script>

{#snippet body()}
	{#if selecting}
		<span
			class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 {selected
				? 'border-accent-600 bg-accent-600 text-white'
				: 'border-slate-300 dark:border-slate-600'}"
			aria-hidden="true"
		>
			{#if selected}<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10" /></svg>{/if}
		</span>
	{/if}
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
{/snippet}

<li data-testid="contact-card">
	{#if selecting}
		<button
			type="button"
			role="checkbox"
			aria-checked={selected}
			class="{base} {selected ? 'border-accent-500 bg-accent-50/50 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-800'}"
			onclick={(e) => ontoggle?.(c.id, e.shiftKey)}
		>
			{@render body()}
		</button>
	{:else}
		<a
			href="/contacts/{c.id}"
			class="{base} border-slate-200 hover:border-accent-500 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800"
		>
			{@render body()}
		</a>
	{/if}
</li>
