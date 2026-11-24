<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import MemberPicker from '#lib/components/MemberPicker.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const g = $derived(data.group);
	const s = $derived(data.stats);
	let editing = $state<'members' | 'name' | 'delete' | null>(null);
	let sure = $state(false);
	const ago = (n: number | null) => (n === null ? 'never logged' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);
	const done = () => {
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			if (result.type === 'success') editing = null;
			await update({ reset: false });
		};
	};
	const btn = 'min-h-11 rounded-[var(--radius-input)] px-3 text-sm hover:bg-surface-2';
</script>

<svelte:head><title>{g.name} · orbit</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<a href="/groups" class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-input)] px-2 text-accent">
		<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>Groups
	</a>
	<h1 class="pt-1 text-2xl font-semibold" data-testid="group-name">{g.name}</h1>
	<p class="mb-3 text-sm text-muted">
		{g.members.length} {g.members.length === 1 ? 'person' : 'people'} ·
		{#if s.lastTogether}last together {s.lastTogether.date} (“{s.lastTogether.title}”, {s.lastTogether.who} of you) · {s.hangoutsThisYear} this year{:else}not together yet{/if}
	</p>

	<div class="mb-3 flex flex-wrap gap-2">
		{#if g.members.length}<a href="/log?people={g.members.join(',')}" class="flex min-h-11 items-center gap-2 rounded-[var(--radius-input)] border border-accent-solid px-3 font-medium text-accent"><span aria-hidden="true">+</span> Log a hangout with everyone</a>{/if}
		<button type="button" class="{btn} border border-line" onclick={() => (editing = editing === 'members' ? null : 'members')} data-testid="edit-members">Edit people</button>
		<button type="button" class="{btn} border border-line" onclick={() => (editing = editing === 'name' ? null : 'name')}>Rename</button>
		<button type="button" class="{btn} border border-line text-attention" onclick={() => ((editing = editing === 'delete' ? null : 'delete'), (sure = false))}>Delete</button>
	</div>
	{#if form?.message && !form.ok}<p class="mb-3 text-sm text-attention" role="alert">{form.message}</p>{/if}

	{#if editing === 'members'}
		<form method="POST" action="?/members" use:enhance={done} class="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
			<MemberPicker contacts={data.contacts} initial={g.members} />
			<div class="mt-3 flex justify-end gap-2">
				<button type="button" class={btn} onclick={() => (editing = null)}>Cancel</button>
				<button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent" data-testid="save-members">Save people</button>
			</div>
		</form>
	{:else if editing === 'name'}
		<form method="POST" action="?/rename" use:enhance={done} class="mb-4 flex gap-2">
			<input name="name" value={g.name} maxlength="80" aria-label="Group name" class="min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-3" />
			<button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent">Rename</button>
		</form>
	{:else if editing === 'delete'}
		<form method="POST" action="?/delete" use:enhance class="mb-4 rounded-[var(--radius-card)] border border-attention p-4 text-sm">
			<p>Delete the group “{g.name}”? This only removes the group from orbit; the people and their history stay in Monica.</p>
			<label class="mt-2 flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" bind:checked={sure} class="size-5" /> I understand</label>
			<button disabled={!sure} class="mt-3 min-h-11 rounded-[var(--radius-input)] bg-attention px-4 font-semibold text-surface disabled:opacity-40">Delete group</button>
		</form>
	{/if}

	<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4">
		<h2 class="mb-2 text-base font-semibold">People</h2>
		{#if s.members.length}
			<ul class="flex flex-col divide-y divide-line" data-testid="group-members">
				{#each s.members as m (m.card.id)}
					<li>
						<a href="/contacts/{m.card.id}" class="-mx-2 flex min-h-14 items-center gap-3 rounded-[var(--radius-input)] px-2 hover:bg-surface-2">
							<Avatar id={m.card.id} name={m.card.name} initials={m.card.initials} color={m.card.color} hasPhoto={m.card.hasPhoto} photoKey={m.card.photoKey} size="size-10" />
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{m.card.name}</span>
								<span class="block truncate text-sm {m.overdueBy !== null ? 'text-attention' : 'text-muted'}">
									Last contact {ago(m.daysSince)}{#if m.overdueBy !== null} · {m.overdueBy} days overdue{/if}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}<p class="text-sm text-muted">No one yet. Tap “Edit people”.</p>{/if}
	</section>
</div>
