<script lang="ts">
	// Duplicates: people with the same name. Pick the one to keep; merge each copy
	// into it (one confirmation per copy). orbit moves tags, phones, emails, the
	// birthday and the photo you choose, then deletes the copy, and refuses when the
	// copy holds anything it cannot move.
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import Tag from '#lib/components/Tag.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let keepChoice = $state<Record<string, number>>({});
	let photoChoice = $state<Record<string, 'keep' | 'copy'>>({});
	let confirming = $state<string | null>(null);
	let busy = $state(false);
	let notice = $state<{ ok: boolean; message: string } | null>(null);

	const keepOf = (g: (typeof data.groups)[number]) => keepChoice[g.key] ?? g.suggestedKeep;
	const added = (iso: string) => (iso ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '');
	// Default photo: the copy's when the person kept has none, or the copy is newer (a photo just set on the phone)
	function defaultPhoto(keep: { hasPhoto: boolean; createdAt: string }, copy: { hasPhoto: boolean; createdAt: string }): 'keep' | 'copy' {
		if (!copy.hasPhoto) return 'keep';
		return !keep.hasPhoto || copy.createdAt > keep.createdAt ? 'copy' : 'keep';
	}

	const submit = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
			notice = d ?? { ok: false, message: 'Something went wrong; check the audit log before trying again.' };
			confirming = null;
			await update({ reset: false });
			busy = false;
		};
	};
	const btn = 'min-h-11 rounded-[var(--radius-input)] px-4 font-semibold disabled:opacity-40';
</script>

<svelte:head><title>Duplicates · orbit</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<h1 class="mb-1 pt-2 text-2xl font-semibold">Duplicates</h1>
	<p class="mb-4 text-sm text-muted">
		People with the same name. Choose who to keep, then merge each copy into them: orbit adds the copy's tags, phones, emails and birthday, keeps the photo you pick,
		and deletes the copy. The copy's full record is saved in the audit log first.
	</p>

	{#if notice}
		<p class="mb-3 rounded-[var(--radius-card)] border p-3 text-sm {notice.ok ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-attention text-attention'}" role="status" data-testid="dup-notice">
			{notice.message}{' '}<a class="underline" href="/audit">Audit log</a>
		</p>
	{/if}

	{#if !data.groups.length}
		<p class="rounded-[var(--radius-card)] border border-line bg-surface p-4 text-muted" data-testid="dup-none">No duplicates: everyone's name is unique.</p>
	{/if}

	<ul class="flex flex-col gap-4" data-testid="dup-groups">
		{#each data.groups as g (g.key)}
			{@const keepId = keepOf(g)}
			{@const keep = g.people.find((p) => p.id === keepId)!}
			<li class="rounded-[var(--radius-card)] border border-line bg-surface p-3" data-testid="dup-group">
				<h2 class="mb-2 font-semibold">{keep.name} <span class="font-normal text-muted">· {g.people.length} people</span></h2>
				<fieldset>
					<legend class="mb-2 text-sm text-muted">Keep</legend>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each g.people as p (p.id)}
							<label class="flex cursor-pointer gap-3 rounded-[var(--radius-input)] border p-2.5 {p.id === keepId ? 'border-accent-solid bg-accent-soft' : 'border-line'}">
								<input type="radio" class="mt-1 accent-[var(--accent)]" name="keep-{g.key}" checked={p.id === keepId} onchange={() => ((keepChoice[g.key] = p.id), (confirming = null))} />
								<Avatar id={p.id} name={p.name} initials={p.initials} color={p.color} hasPhoto={p.hasPhoto} photoKey={p.photoKey} size="size-11" />
								<span class="min-w-0 flex-1 text-sm">
									<a href="/contacts/{p.id}" class="font-medium hover:underline">{p.name}</a>
									<span class="block text-xs text-muted">Added {added(p.createdAt)}{p.holds ? ` · ${p.holds}` : ''}</span>
									{#if p.tags.length}<span class="mt-1 flex flex-wrap gap-1">{#each p.tags as t (t)}<Tag name={t} />{/each}</span>{/if}
									{#if p.fields.length}<span class="mt-1 block truncate text-xs text-muted">{p.fields.join(' · ')}</span>{/if}
									{#if p.birthday}<span class="block text-xs text-muted">Birthday {p.birthday.replace('????-', '')}</span>{/if}
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				{#each g.people.filter((p) => p.id !== keepId) as copy (copy.id)}
					{@const plan = g.plans[`${keepId}:${copy.id}`]}
					{@const cKey = `${keepId}:${copy.id}`}
					{@const photo = photoChoice[cKey] ?? defaultPhoto(keep, copy)}
					<form method="POST" action="?/merge" use:enhance={submit} class="mt-3 rounded-[var(--radius-input)] border border-line bg-surface-2 p-3 text-sm" data-testid="dup-merge">
						<input type="hidden" name="keep" value={keep.id} />
						<input type="hidden" name="copy" value={copy.id} />
						<input type="hidden" name="keepUpdatedAt" value={keep.updatedAt} />
						<input type="hidden" name="copyUpdatedAt" value={copy.updatedAt} />
						<input type="hidden" name="photo" value={photo} />
						<p class="font-medium">Merge the copy added {added(copy.createdAt)} into the one you keep</p>
						{#if plan.blockers.length}
							<ul class="mt-1 list-disc pl-5 text-attention" data-testid="dup-blockers">
								{#each plan.blockers as b (b)}<li>{b}</li>{/each}
							</ul>
							<p class="mt-1 text-muted">orbit won't merge these. Fix it in Monica first, or keep both.</p>
						{:else}
							<p class="mt-1 text-muted" data-testid="dup-plan">
								{#if plan.tags.length || plan.fields.length || plan.birthday}
									Adds {[...plan.tags.map((t) => `tag “${t}”`), ...plan.fields.map((f) => f.content), ...(plan.birthday ? ['the birthday'] : [])].join(', ')}.
								{:else}
									Nothing new to add: the copy only repeats what the one you keep has.
								{/if}
							</p>
							{#if plan.copyHasPhoto}
								<div class="mt-2 flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Photo to keep">
									<span class="text-muted">Photo:</span>
									{#each [['keep', keep], ['copy', copy]] as const as [which, p] (which)}
										<label class="flex cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border px-2 py-1 {photo === which ? 'border-accent-solid' : 'border-line'}">
											<input type="radio" class="accent-[var(--accent)]" name="photo-{cKey}" checked={photo === which} onchange={() => (photoChoice[cKey] = which)} />
											<Avatar id={p.id} name={p.name} initials={p.initials} color={p.color} hasPhoto={p.hasPhoto} photoKey={p.photoKey} size="size-8" />
											{which === 'keep' ? 'current' : "the copy's"}
										</label>
									{/each}
								</div>
							{/if}
							{#if confirming === cKey}
								<div class="mt-3 rounded-[var(--radius-input)] border border-attention p-2.5" data-testid="dup-confirm">
									<p>Merge, then <strong>delete the copy</strong> from Monica? Your phone drops it on its next sync. orbit can't undo this; the copy's record stays in the audit log.</p>
									<div class="mt-2 flex gap-2">
										<button disabled={busy} class="{btn} bg-attention text-surface" data-testid="dup-confirm-yes">{busy ? 'Merging…' : 'Merge and delete copy'}</button>
										<button type="button" class="{btn} border border-line font-medium" onclick={() => (confirming = null)}>Cancel</button>
									</div>
								</div>
							{:else}
								<button type="button" disabled={busy} class="{btn} mt-2 bg-accent-solid text-on-accent" onclick={() => (confirming = cKey)} data-testid="dup-merge-btn">Merge…</button>
							{/if}
						{/if}
					</form>
				{/each}
			</li>
		{/each}
	</ul>
</div>
