<script lang="ts">
	import { enhance } from '$app/forms';
	import { tagCounts } from '#lib/contacts.js';
	import { useTagHue } from '#lib/tag-colours.js';
	import { tagColourKey } from '#lib/tag-colours.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tagHue = useTagHue();
	const counts = $derived(tagCounts(data.contacts, data.tagNames));
	const untagged = $derived(data.contacts.filter((c) => !c.tags.length).length);
	const max = $derived(Math.max(1, ...counts.map((t) => t.count)));
	const byName = $derived(new Map(data.tags.map((t) => [t.name, t])));

	let editing = $state<string | null>(null);
	let newName = $state('');
	let mergeTo = $state('');
	let busy = $state(false);
	let notice = $state<{ ok: boolean; message: string; local?: boolean } | null>(null);

	function edit(name: string) {
		editing = editing === name ? null : name;
		newName = name;
		mergeTo = '';
		notice = null;
	}
	const submit = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			busy = false;
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string; local?: boolean } | null;
			notice = d ?? { ok: false, message: 'Something went wrong. Check the audit log.' };
			if (d?.ok && !d.local) editing = null;
			await update({ reset: false });
		};
	};
	const input = 'min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-3';
	const btn = 'min-h-11 rounded-[var(--radius-input)] px-4 font-semibold disabled:opacity-40';
</script>

<svelte:head><title>Tags · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<h1 class="mb-1 pt-2 text-2xl font-semibold">Tags</h1>
	<p class="mb-4 text-sm text-muted">{counts.length} tags · tap one to see its people, or Edit to change its colour, rename or merge it.</p>
	{#if notice}
		<p class="mb-3 rounded-[var(--radius-card)] border p-3 text-sm {notice.ok ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-attention text-attention'}" role="status" data-testid="tags-notice">
			{notice.message}{#if !notice.local}{' '}<a class="underline" href="/audit">Audit log</a>{/if}
		</p>
	{/if}

	<ul class="flex flex-col gap-2" data-testid="tag-list">
		{#each counts as t (t.name)}
			{@const tag = byName.get(t.name)}
			{@const chosen = data.tagHues[tagColourKey(t.name)] ?? 0}
			<li>
				<div class="flex gap-2">
					<a
						href="/contacts?tag={encodeURIComponent(t.name)}"
						class="relative flex min-h-12 min-w-0 flex-1 items-center justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface px-4"
					>
						<span class="absolute inset-y-0 left-0" style:background-color="var(--tag-{tagHue(t.name)}-bg)" style:width="{(t.count / max) * 100}%" aria-hidden="true"></span>
						<span class="relative flex min-w-0 items-center gap-2 font-semibold"><span class="size-2.5 shrink-0 rounded-[2px]" style:background-color="var(--hue-{tagHue(t.name)})" aria-hidden="true"></span><span class="truncate">{t.name}</span></span>
						<span class="relative shrink-0 text-sm text-muted tabular-nums">{t.count === 0 ? 'unused' : `${t.count} ${t.count === 1 ? 'person' : 'people'}`}</span>
					</a>
					{#if tag}
						<button type="button" class="min-h-12 rounded-[var(--radius-card)] border border-line px-3 text-sm text-muted hover:bg-surface-2 hover:text-fg" aria-expanded={editing === t.name} onclick={() => edit(t.name)} data-testid="tag-edit">Edit</button>
					{/if}
				</div>
				{#if tag && editing === t.name}
					<div class="mt-2 flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3" data-testid="tag-editor">
						<form method="POST" action="?/colour" use:enhance={submit}>
							<input type="hidden" name="name" value={t.name} />
							<p class="mb-1 text-sm text-muted" id="colour-{tag.id}">Colour</p>
							<div class="flex flex-wrap gap-2" role="group" aria-labelledby="colour-{tag.id}" data-testid="tag-colours">
								<button
									name="hue"
									value="0"
									disabled={busy}
									aria-pressed={chosen === 0}
									class="min-h-11 rounded-[var(--radius-input)] border px-3 text-sm {chosen === 0 ? 'border-fg font-semibold' : 'border-line text-muted hover:text-fg'}"
								>Auto</button>
								{#each [1, 2, 3, 4, 5, 6] as h (h)}
									<button
										name="hue"
										value={h}
										disabled={busy}
										aria-pressed={chosen === h}
										aria-label="Colour {h}"
										class="flex size-11 items-center justify-center rounded-[var(--radius-input)] border-2 {chosen === h ? 'border-fg' : 'border-transparent'}"
										style:background-color="var(--tag-{h}-bg)"
									><span class="size-4 rounded-[2px]" style:background-color="var(--hue-{h})"></span></button>
								{/each}
							</div>
							<p class="mt-1 text-xs text-muted">Colours follow your theme. Saved in orbit only; Monica has no tag colours.</p>
						</form>
						<form method="POST" action="?/rename" use:enhance={submit}>
							<input type="hidden" name="tagId" value={tag.id} />
							<input type="hidden" name="updatedAt" value={tag.updatedAt ?? ''} />
							<label class="mb-1 block text-sm text-muted" for="rename-{tag.id}">Rename</label>
							<div class="flex gap-2">
								<input id="rename-{tag.id}" name="name" bind:value={newName} maxlength="255" autocomplete="off" class={input} />
								<button disabled={busy || !newName.trim() || newName.trim() === t.name} class="{btn} bg-accent-solid text-on-accent">Rename</button>
							</div>
							<p class="mt-1 text-xs text-muted">Everyone keeps the tag; only its name changes, in Monica too.</p>
						</form>
						{#if data.tags.length > 1}
							<form method="POST" action="?/merge" use:enhance={submit}>
								<input type="hidden" name="fromId" value={tag.id} />
								<label class="mb-1 block text-sm text-muted" for="merge-{tag.id}">Merge into</label>
								<div class="flex gap-2">
									<select id="merge-{tag.id}" name="toId" bind:value={mergeTo} class={input}>
										<option value="">Pick a tag…</option>
										{#each data.tags.filter((x) => x.id !== tag.id) as o (o.id)}<option value={String(o.id)}>{o.name}</option>{/each}
									</select>
									<button disabled={busy || !mergeTo} class="{btn} border border-attention text-attention" data-testid="tag-merge">Merge</button>
								</div>
								{#if mergeTo}
									{@const target = data.tags.find((x) => String(x.id) === mergeTo)}
									<p class="mt-1 text-xs text-muted">
										Moves {t.count} {t.count === 1 ? 'person' : 'people'} from “{t.name}” to “{target?.name}”, one by one. “{t.name}” then stays as an unused tag (orbit never deletes tags; you can in Monica).
									</p>
								{/if}
							</form>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
		<li>
			<a href="/contacts?untagged=1" class="flex min-h-12 items-center justify-between rounded-[var(--radius-card)] border border-dashed border-control px-4 text-muted">
				<span>Untagged</span>
				<span class="text-sm tabular-nums">{untagged} {untagged === 1 ? 'person' : 'people'}</span>
			</a>
		</li>
	</ul>
</div>
