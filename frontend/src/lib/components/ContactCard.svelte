<script lang="ts">
	import { fullDate, relativeDate, type ContactCard } from '#lib/contacts.js';
	import Avatar from './Avatar.svelte';
	import Tag from './Tag.svelte';

	interface Props {
		contact: ContactCard;
		/** 'cards': boxed tiles; 'lines': one row per person with hairline dividers. */
		view?: 'cards' | 'lines';
		/** In select mode the whole item toggles selection instead of opening the contact. */
		selecting?: boolean;
		selected?: boolean;
		ontoggle?: (id: number, shiftKey: boolean) => void;
	}
	let { contact: c, view = 'cards', selecting = false, selected = false, ontoggle }: Props = $props();

	const last = $derived(c.lastContacted ? `Last contact ${relativeDate(c.lastContacted)}` : 'No catch-ups logged');
	const base = $derived(
		view === 'cards'
			? 'flex h-full w-full items-start gap-3 rounded-[var(--radius-card)] border bg-surface p-3 text-left transition-colors duration-150'
			: 'grid w-full items-center gap-x-3 px-2 py-2 text-left transition-colors duration-150 ' +
					'grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(9rem,1.1fr)_minmax(0,1.4fr)_7.5rem_9rem]'
	);
	const stateCls = $derived(
		view === 'cards'
			? selected
				? 'border-accent-solid ring-1 ring-accent-solid'
				: 'border-line hover:border-control'
			: selected
				? 'bg-accent-soft'
				: 'hover:bg-surface-2'
	);
</script>

{#snippet check()}
	{#if selecting}
		<span
			class="flex size-5 shrink-0 items-center justify-center rounded-[3px] border-2 {selected ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-control'}"
			aria-hidden="true"
		>
			{#if selected}<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5 9-10" /></svg>{/if}
		</span>
	{/if}
{/snippet}

{#snippet name()}
	<span class="block truncate font-semibold" data-name>
		{c.name}{#if c.nickname}<span class="ml-1.5 font-normal text-muted italic">{c.nickname}</span>{/if}
	</span>
{/snippet}

{#snippet tags(max = 99)}
	{#if c.tags.length}
		<span class="flex flex-wrap gap-1" aria-label="Tags">
			{#each c.tags.slice(0, max) as t (t)}<Tag name={t} />{/each}
			{#if c.tags.length > max}<span class="text-xs text-muted">+{c.tags.length - max}</span>{/if}
		</span>
	{/if}
{/snippet}

{#snippet body()}
	{#if view === 'cards'}
		{@render check()}
		<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-11" />
		<span class="min-w-0 flex-1">
			{@render name()}
			<span class="mt-0.5 block truncate text-sm text-muted">
				{#if c.lastContacted}<time datetime={c.lastContacted} title={fullDate(c.lastContacted)}>{last}</time>{:else}{last}{/if}
			</span>
			<span class="mt-1.5 block">{@render tags()}</span>
		</span>
	{:else}
		<span class="flex items-center gap-3">
			{@render check()}
			<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-8" text="text-xs" />
		</span>
		<span class="min-w-0">
			{@render name()}
			<!-- Phone: tags under the name. Desktop: their own column. -->
			<span class="mt-0.5 block lg:hidden">{@render tags(3)}</span>
		</span>
		<span class="hidden min-w-0 lg:block">{@render tags(4)}</span>
		<span class="text-right text-sm text-muted tabular lg:text-left">
			{#if c.lastContacted}<time datetime={c.lastContacted} title={fullDate(c.lastContacted)}>{relativeDate(c.lastContacted)}</time>{:else}<span class="sr-only">No catch-ups logged</span>{/if}
		</span>
		<span class="hidden truncate text-sm text-muted tabular lg:block">{c.phones[0] ?? c.emails[0] ?? ''}</span>
	{/if}
{/snippet}

<li data-testid="contact-card" class={view === 'lines' ? 'border-b border-line last:border-b-0' : ''}>
	{#if selecting}
		<button type="button" role="checkbox" aria-checked={selected} class="{base} {stateCls}" onclick={(e) => ontoggle?.(c.id, e.shiftKey)}>
			{@render body()}
		</button>
	{:else}
		<a href="/contacts/{c.id}" class="{base} {stateCls}">
			{@render body()}
		</a>
	{/if}
</li>
