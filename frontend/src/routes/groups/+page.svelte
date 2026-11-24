<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import MemberPicker from '#lib/components/MemberPicker.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let creating = $state(false);
	const byId = $derived(new Map(data.contacts.map((c) => [c.id, c])));
	const ago = (iso: string) => {
		const d = Math.floor((Date.now() - Date.parse(iso + 'T00:00:00Z')) / 86_400_000);
		return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
	};
</script>

<svelte:head><title>Groups · orbit</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<div class="flex items-center justify-between pt-2 pb-1">
		<h1 class="text-2xl font-semibold">Groups</h1>
		{#if !creating}<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 font-medium text-accent hover:bg-surface-2" onclick={() => (creating = true)} data-testid="new-group">+ New group</button>{/if}
	</div>
	<p class="mb-4 text-sm text-muted">Friend groups, kept in orbit (Monica doesn’t have them). “Together” counts hangouts with at least two of the group.</p>

	{#if creating}
		<form method="POST" action="?/create" use:enhance class="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid="group-form">
			<label class="block text-sm"><span class="text-muted">Name</span><input name="name" maxlength="80" required placeholder="e.g. Climbing crew" class="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3" /></label>
			<div class="mt-3"><MemberPicker contacts={data.contacts} /></div>
			{#if form && !form.ok}<p class="mt-2 text-sm text-attention" role="alert">{form.message}</p>{/if}
			<div class="mt-3 flex justify-end gap-2">
				<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (creating = false)}>Cancel</button>
				<button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent" data-testid="group-create">Create group</button>
			</div>
		</form>
	{/if}

	{#if data.groups.length}
		<ul class="grid gap-3 sm:grid-cols-2" data-testid="group-list">
			{#each data.groups as g (g.id)}
				{@const overdue = g.stats.members.filter((m) => m.overdueBy !== null).length}
				<li>
					<a href="/groups/{g.id}" class="block h-full rounded-[var(--radius-card)] border border-line bg-surface p-4 hover:border-control">
						<p class="font-semibold">{g.name} <span class="text-sm font-normal text-muted">· {g.members.length}</span></p>
						<div class="mt-2 flex -space-x-1.5">
							{#each g.members.slice(0, 8) as id (id)}
								{@const c = byId.get(id)}
								{#if c}<span class="rounded-[var(--radius-photo)] ring-2 ring-[var(--surface)]"><Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} photoKey={c.photoKey} size="size-8" text="text-xs" /></span>{/if}
							{/each}
						</div>
						<p class="mt-2 text-sm text-muted">
							{#if g.stats.lastTogether}Together {ago(g.stats.lastTogether.date)} · {g.stats.hangoutsThisYear} this year{:else}Not together yet{/if}
							{#if overdue}<span class="font-medium text-attention"> · {overdue} overdue</span>{/if}
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{:else if !creating}
		<p class="rounded-[var(--radius-card)] border border-dashed border-control p-6 text-center text-sm text-muted">No groups yet. Make one for the people you see together.</p>
	{/if}
</div>
