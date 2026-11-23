<script lang="ts">
	// Tags on one person's page: tap a tag to filter People, "+ Tag" to add one
	// (suggestions from Monica's tags, or a new name), × to take one off. Uses the
	// same guarded writes as bulk tags (setTags / unsetTag, one tag per request).
	import { enhance } from '$app/forms';
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
	const matches = $derived(
		name.trim() ? suggestions.filter((t) => t.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase())).slice(0, 8) : suggestions.slice(0, 8)
	);
	const isNew = $derived(!!name.trim() && !allTags.some((t) => t.toLocaleLowerCase() === name.trim().toLocaleLowerCase()));

	function openAdd() {
		adding = true;
		removing = null;
		name = '';
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
			<div class="flex gap-2">
				<input
					bind:this={input}
					bind:value={name}
					name="tag"
					maxlength="255"
					autocomplete="off"
					placeholder="Tag name"
					aria-label="Tag name"
					class="min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-3"
					onkeydown={(e) => e.key === 'Escape' && (adding = false)}
				/>
				<button disabled={busy || !name.trim()} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40" data-testid="add-tag-save">
					{busy ? 'Adding…' : 'Add'}
				</button>
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (adding = false)}>Cancel</button>
			</div>
			{#if matches.length}
				<div class="mt-2 flex flex-wrap gap-1" aria-label="Existing tags">
					{#each matches as t (t)}
						<button type="button" class="rounded-[var(--radius-chip)] {name === t ? 'ring-2 ring-accent-solid' : ''}" onclick={() => (name = t)}>
							<Tag name={t} size="md" />
						</button>
					{/each}
				</div>
			{/if}
			{#if isNew}<p class="mt-1 text-xs text-muted">“{name.trim()}” is a new tag; Monica creates it.</p>{/if}
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
