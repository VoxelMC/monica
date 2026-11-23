<script lang="ts">
	// Tags on one person's page: tap a tag to filter People, "+ Tag" to add some
	// (tick any of Monica's tags and/or type a new name), × to take one off. Uses the
	// same guarded writes as bulk tags (setTags / unsetTag, one tag per request).
	import { enhance } from '$app/forms';
	import { SvelteSet } from 'svelte/reactivity';
	import Tag from './Tag.svelte';

	interface Props {
		tags: string[];
		allTags: string[];
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { tags, allTags, ondone }: Props = $props();

	let adding = $state(false);
	let removing = $state<string | null>(null);
	let name = $state('');
	let busy = $state(false);
	let input = $state<HTMLInputElement>();
	const lower = $derived(new Set(tags.map((t) => t.toLocaleLowerCase())));
	const suggestions = $derived(allTags.filter((t) => !lower.has(t.toLocaleLowerCase())));
	const selected = new SvelteSet<string>();
	const typed = $derived(name.trim());
	const matches = $derived(
		(typed ? suggestions.filter((t) => t.toLocaleLowerCase().includes(typed.toLocaleLowerCase())) : suggestions).slice(0, 40)
	);
	// What the typed text adds: an existing tag (Monica's spelling) or a new one
	const typedExisting = $derived(typed ? allTags.find((t) => t.toLocaleLowerCase() === typed.toLocaleLowerCase()) : undefined);
	const isNew = $derived(!!typed && !typedExisting);
	const toAdd = $derived([...new Set([...selected, ...(typed ? [typedExisting ?? typed] : [])])].filter((t) => !lower.has(t.toLocaleLowerCase())));

	function toggle(t: string) {
		if (selected.has(t)) selected.delete(t);
		else selected.add(t);
		name = ''; // the text was only a filter
		input?.focus();
	}

	function openAdd() {
		adding = true;
		removing = null;
		name = '';
		selected.clear();
		queueMicrotask(() => input?.focus());
	}

	const submit = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			busy = false;
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
			ondone(d ?? { ok: false, message: 'Something went wrong; the tag may not have changed. Check the audit log.' });
			if (d?.ok) {
				adding = false;
				removing = null;
				name = '';
				selected.clear();
			}
			await update({ reset: false });
		};
	};
	const chipBtn = 'inline-flex min-h-8 items-center rounded-[var(--radius-chip)] border px-2.5 text-sm';
</script>

<div class="mb-3" data-testid="contact-tags">
	<ul class="flex flex-wrap items-center gap-1.5 pt-1" aria-label="Tags">
		{#each tags as t (t)}
			<!-- × sits on the tag's corner: shown on hover or keyboard focus; always on touch screens (no hover there) -->
			<li class="relative inline-flex">
				<Tag name={t} href="/contacts?tag={encodeURIComponent(t)}" size="md" />
				<button
					type="button"
					class="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full border border-line bg-surface text-xs leading-none text-muted shadow-sm transition-opacity before:absolute before:-inset-2 before:content-[''] hover:border-attention hover:text-attention tag-x"
					class:shown={removing === t}
					aria-label="Remove tag {t}"
					onclick={() => ((removing = removing === t ? null : t), (adding = false))}>×</button
				>
			</li>
		{/each}
		<li>
			<button type="button" class="{chipBtn} border-dashed border-line text-muted hover:bg-surface-2 hover:text-fg" onclick={openAdd} aria-expanded={adding} data-testid="add-tag">
				+ {tags.length ? 'Tag' : 'Add tag'}
			</button>
		</li>
	</ul>

	{#if removing}
		<form method="POST" action="?/tag" use:enhance={submit} class="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="remove-tag-confirm">
			<input type="hidden" name="mode" value="remove" />
			<input type="hidden" name="tag" value={removing} />
			<span>Take “{removing}” off this person? The tag stays in Monica.</span>
			<button disabled={busy} class="min-h-9 rounded-[var(--radius-input)] border border-attention px-3 font-medium text-attention disabled:opacity-40">{busy ? 'Removing…' : 'Remove'}</button>
			<button type="button" class="min-h-9 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (removing = null)}>Cancel</button>
		</form>
	{/if}

	{#if adding}
		<form method="POST" action="?/tag" use:enhance={submit} class="mt-2" data-testid="add-tag-form">
			<input type="hidden" name="mode" value="add" />
			{#each toAdd as t (t)}<input type="hidden" name="tag" value={t} />{/each}
			<div class="flex gap-2">
				<input
					bind:this={input}
					bind:value={name}
					maxlength="255"
					autocomplete="off"
					placeholder={suggestions.length ? 'Filter or new tag' : 'New tag'}
					aria-label="Filter tags or type a new one"
					class="min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-3"
					onkeydown={(e) => {
						if (e.key === 'Escape') adding = false;
						// Enter on a filter that leaves one tag ticks it instead of submitting
						if (e.key === 'Enter' && typed && !typedExisting && matches.length === 1) {
							e.preventDefault();
							toggle(matches[0]);
						}
					}}
				/>
				<button disabled={busy || !toAdd.length} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold whitespace-nowrap text-on-accent disabled:opacity-40" data-testid="add-tag-save">
					{busy ? 'Adding…' : toAdd.length > 1 ? `Add ${toAdd.length}` : 'Add'}
				</button>
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (adding = false)}>Cancel</button>
			</div>
			{#if matches.length}
				<div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Existing tags">
					{#each matches as t (t)}
						{@const on = selected.has(t)}
						<button
							type="button"
							aria-pressed={on}
							class="relative rounded-[var(--radius-chip)] {on ? 'ring-2 ring-accent-solid' : 'opacity-80 hover:opacity-100'}"
							onclick={() => toggle(t)}
						>
							<Tag name={t} size="md" />
							{#if on}<span class="absolute -top-1.5 -right-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent-solid text-[11px] text-on-accent" aria-hidden="true">✓</span>{/if}
						</button>
					{/each}
				</div>
			{/if}
			{#if toAdd.length}
				<p class="mt-2 text-sm text-muted" data-testid="add-tag-preview">
					Adds {#each toAdd as t, i (t)}{i ? ', ' : ''}<span class="text-fg">{t}</span>{#if isNew && t === typed}{' '}(new){/if}{/each}
				</p>
			{/if}
		</form>
	{/if}
</div>

<style>
	/* Mouse: × only while hovering or focusing the tag. Touch screens (no hover): always shown. */
	@media (hover: hover) {
		.tag-x:not(.shown) {
			opacity: 0;
		}
		li:hover > .tag-x,
		li:focus-within > .tag-x {
			opacity: 1;
		}
	}
</style>
