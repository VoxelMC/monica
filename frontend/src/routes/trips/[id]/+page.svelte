<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '#lib/components/Avatar.svelte';
	import MemberPicker from '#lib/components/MemberPicker.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = $derived(data.trip);
	const byId = $derived(new Map(data.contacts.map((c) => [c.id, c])));
	let mode = $state<'add' | 'edit' | 'delete' | null>(null);
	let sure = $state(false);
	let groupId = $state('');
	const group = $derived(data.groups.find((g) => String(g.id) === groupId));
	const keep = () => {
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			if (result.type === 'success') mode = null;
			await update({ reset: false });
		};
	};
	const quiet = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
	const input = 'mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-3';
	const btn = 'min-h-11 rounded-[var(--radius-input)] border border-line px-3 text-sm hover:bg-surface-2';
	const people = $derived([...t.people].sort((a, b) => Number(a.done) - Number(b.done) || (byId.get(a.contactId)?.name ?? '').localeCompare(byId.get(b.contactId)?.name ?? '')));
</script>

<svelte:head><title>{t.name} · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<a href="/trips" class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-input)] px-2 text-accent">
		<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>Trips
	</a>
	<h1 class="pt-1 text-2xl font-semibold">{t.name}</h1>
	<p class="mb-3 text-sm text-muted">{[t.destination, [t.startDate, t.endDate].filter(Boolean).join(' → ')].filter(Boolean).join(' · ') || 'No dates yet'}</p>

	<div class="mb-3 flex flex-wrap gap-2">
		<button type="button" class="{btn} font-medium text-accent" onclick={() => (mode = mode === 'add' ? null : 'add')} data-testid="trip-add">+ Add people</button>
		<button type="button" class={btn} onclick={() => (mode = mode === 'edit' ? null : 'edit')}>Edit trip</button>
		<button type="button" class="{btn} text-attention" onclick={() => ((mode = mode === 'delete' ? null : 'delete'), (sure = false))}>Delete</button>
	</div>
	{#if form?.message && !form.ok}<p class="mb-3 text-sm text-attention" role="alert">{form.message}</p>{/if}

	{#if mode === 'add'}
		<div class="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
			{#if data.groups.length}
				<form method="POST" action="?/add" use:enhance={keep} class="mb-3 flex gap-2">
					{#if group}{#each group.members as m (m)}<input type="hidden" name="member" value={m} />{/each}{/if}
					<select bind:value={groupId} aria-label="Add a whole group" class="min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-2">
						<option value="">Add a whole group…</option>
						{#each data.groups as g (g.id)}<option value={String(g.id)}>{g.name} ({g.members.length})</option>{/each}
					</select>
					<button disabled={!group} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40">Add group</button>
				</form>
			{/if}
			<form method="POST" action="?/add" use:enhance={keep}>
				<MemberPicker contacts={data.contacts.filter((c) => !t.people.some((p) => p.contactId === c.id))} />
				<div class="mt-3 flex justify-end"><button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent" data-testid="trip-add-save">Add picked</button></div>
			</form>
		</div>
	{:else if mode === 'edit'}
		<form method="POST" action="?/update" use:enhance={keep} class="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
			<label class="block text-sm"><span class="text-muted">Trip</span><input name="name" value={t.name} required maxlength="80" class={input} /></label>
			<label class="mt-2 block text-sm"><span class="text-muted">Where</span><input name="destination" value={t.destination ?? ''} maxlength="120" class={input} /></label>
			<div class="mt-2 grid grid-cols-2 gap-2">
				<label class="block text-sm"><span class="text-muted">From</span><input name="startDate" type="date" value={t.startDate ?? ''} class={input} /></label>
				<label class="block text-sm"><span class="text-muted">To</span><input name="endDate" type="date" value={t.endDate ?? ''} class={input} /></label>
			</div>
			<div class="mt-3 flex justify-end"><button class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent">Save</button></div>
		</form>
	{:else if mode === 'delete'}
		<form method="POST" action="?/delete" use:enhance class="mb-4 rounded-[var(--radius-card)] border border-attention p-4 text-sm">
			<p>Delete “{t.name}” and its list? This only affects orbit.</p>
			<label class="mt-2 flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" bind:checked={sure} class="size-5" /> I understand</label>
			<button disabled={!sure} class="mt-3 min-h-11 rounded-[var(--radius-input)] bg-attention px-4 font-semibold text-surface disabled:opacity-40">Delete trip</button>
		</form>
	{/if}

	<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4">
		<h2 class="mb-2 text-base font-semibold">Bring something back for <span class="text-sm font-normal text-muted">· {t.people.filter((p) => p.done).length} of {t.people.length} done</span></h2>
		{#if people.length}
			<ul class="flex flex-col divide-y divide-line" data-testid="souvenirs">
				{#each people as p (p.contactId)}
					{@const c = byId.get(p.contactId)}
					<li class="flex items-center gap-3 py-2">
						<form method="POST" action="?/item" use:enhance={quiet}>
							<input type="hidden" name="contactId" value={p.contactId} />
							<input type="hidden" name="done" value={p.done ? '0' : '1'} />
							<button class="flex size-11 items-center justify-center rounded-[var(--radius-input)] hover:bg-surface-2" aria-label="{p.done ? 'Not done' : 'Done'}: {c?.name ?? 'someone'}" aria-pressed={p.done} data-testid="souvenir-tick">
								<span class="flex size-6 items-center justify-center rounded-[4px] border-2 {p.done ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-control'}">{p.done ? '✓' : ''}</span>
							</button>
						</form>
						{#if c}<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} photoKey={c.photoKey} size="size-8" text="text-xs" />{/if}
						<div class="min-w-0 flex-1">
							<a href="/contacts/{p.contactId}" class="block truncate font-medium {p.done ? 'text-muted line-through' : ''}">{c?.name ?? 'Not in Monica any more'}</a>
							<form method="POST" action="?/item" use:enhance={quiet}>
								<input type="hidden" name="contactId" value={p.contactId} />
								<input name="note" value={p.note} maxlength="500" placeholder="What to get…" aria-label="Note for {c?.name ?? 'this person'}" class="w-full bg-transparent text-sm text-muted outline-none placeholder:text-muted/60 focus:text-fg" onchange={(e) => (e.currentTarget as HTMLInputElement).form?.requestSubmit()} data-testid="souvenir-note" />
							</form>
						</div>
						<form method="POST" action="?/item" use:enhance={quiet}>
							<input type="hidden" name="contactId" value={p.contactId} />
							<input type="hidden" name="remove" value="1" />
							<button class="flex size-11 items-center justify-center rounded-[var(--radius-input)] text-muted hover:bg-surface-2" aria-label="Take {c?.name ?? 'them'} off the list">×</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}<p class="text-sm text-muted">No one yet. Tap “Add people”.</p>{/if}
	</section>
</div>
