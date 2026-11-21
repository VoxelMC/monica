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
		'flex min-h-[4.5rem] w-full items-center gap-3 rounded-[var(--radius-card)] border bg-surface p-3 text-left';
</script>

{#snippet body()}
	{#if selecting}
		<span
			class="flex size-6 shrink-0 items-center justify-center rounded-md border-2 {selected
				? 'border-accent-solid bg-accent-solid text-on-accent'
				: 'border-control'}"
			aria-hidden="true"
		>
			{#if selected}<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10" /></svg>{/if}
		</span>
	{/if}
	<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} />
	<div class="min-w-0 flex-1">
		<p class="truncate font-medium">
			{c.name}
			{#if c.nickname}<span class="font-normal text-muted">“{c.nickname}”</span>{/if}
		</p>
		<p class="truncate text-sm text-muted">
			{#if c.lastContacted}
				<time datetime={c.lastContacted} title={fullDate(c.lastContacted)}>Last contact {relativeDate(c.lastContacted)}</time>
			{:else}
				No catch-ups logged
			{/if}
		</p>
		{#if c.tags.length}
			<ul class="mt-1 flex flex-wrap gap-1" aria-label="Tags">
				{#each c.tags as t (t)}
					<li class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-on-accent-soft">{t}</li>
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
			class="{base} {selected ? 'border-accent-solid ring-1 ring-accent-solid' : 'border-line'}"
			onclick={(e) => ontoggle?.(c.id, e.shiftKey)}
		>
			{@render body()}
		</button>
	{:else}
		<a
			href="/contacts/{c.id}"
			class="{base} border-line hover:border-accent active:bg-surface-2"
		>
			{@render body()}
		</a>
	{/if}
</li>
