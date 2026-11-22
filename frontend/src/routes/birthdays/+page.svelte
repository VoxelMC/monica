<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import { birthdayPayload, checkBirthday, daysInMonth, type NewBirthday } from '#lib/birthday-write.js';
	import { fullDate, searchContacts } from '#lib/contacts.js';
	import { upcomingBirthdays } from '#lib/dashboard.js';
	import { onMount, tick } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

	// ---- The year ahead, grouped by month
	const year = $derived(upcomingBirthdays(data.contacts, new Date(), 366));
	const byMonth = $derived(
		year.reduce<{ label: string; items: typeof year }[]>((acc, b) => {
			const d = new Date(b.info.nextIso + 'T00:00:00');
			const label = d.toLocaleDateString('en', { month: 'long', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
			if (acc.at(-1)?.label === label) acc.at(-1)!.items.push(b);
			else acc.push({ label, items: [b] });
			return acc;
		}, [])
	);
	const when = (d: number) => (d === 0 ? 'Today 🎉' : d === 1 ? 'Tomorrow' : `In ${d} days`);

	// ---- People without a birthday: quick entry, one row each
	const missing = $derived(data.contacts.filter((c) => !c.birthday && !data.bases.find((b) => b.id === c.id)?.isDead));
	let search = $state('');
	const shownMissing = $derived(searchContacts(missing, search));
	let entries = $state<Record<number, { month: string; day: string; year: string }>>({});
	const entry = (id: number) => entries[id] ?? { month: '', day: '', year: '' };
	function setEntry(id: number, key: 'month' | 'day' | 'year', value: string) {
		entries = { ...entries, [id]: { ...entry(id), [key]: value } };
	}
	const parsed = (id: number): Partial<NewBirthday> => {
		const e = entry(id);
		return { month: e.month ? +e.month : undefined, day: e.day ? +e.day : undefined, year: e.year.trim() ? +e.year : null };
	};
	const started = (id: number) => !!(entry(id).month || entry(id).day || entry(id).year.trim());
	const problem = (id: number) => (started(id) ? checkBirthday(parsed(id)) : null);
	const ready = $derived(missing.filter((c) => started(c.id) && !problem(c.id)));

	const requests = $derived(
		ready.map((c) => {
			const base = data.bases.find((b) => b.id === c.id)!;
			return { name: c.name, path: `/api/contacts/${c.id}`, body: birthdayPayload(base, parsed(c.id) as NewBirthday) };
		})
	);
	let previewOpen = $state(false);
	let saving = $state(false);
	let outcome = $state<{ ok: boolean; message: string; saved: number[] } | null>(null);
	const draftJson = $derived(
		JSON.stringify({
			entries: ready.map((c) => ({ id: c.id, ...(parsed(c.id) as NewBirthday), updatedAt: c.updatedAt ?? '' }))
		})
	);

	// ?contact=ID (from a contact page): jump to that person's row
	const focusId = Number(page.url.searchParams.get('contact')) || null;
	onMount(async () => {
		if (!focusId) return;
		await tick();
		const row = document.getElementById(`missing-${focusId}`);
		row?.scrollIntoView({ block: 'center' });
		(row?.querySelector('select') as HTMLSelectElement | null)?.focus();
	});

	const field = 'h-9 min-w-0 rounded-[var(--radius-input)] border border-control bg-surface px-2';
</script>

<svelte:head><title>Birthdays · orbit</title></svelte:head>

<div class="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32 lg:px-8">
	<h1 class="pt-2 pb-1 text-2xl font-semibold">Birthdays</h1>
	{#if outcome}
		<p class="my-3 rounded-[var(--radius-card)] border p-3 text-sm {outcome.ok ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-attention text-attention'}" role="status" data-testid="birthday-outcome">
			{outcome.message} <a class="underline" href="/audit">Audit log</a>
		</p>
	{/if}
	<p class="mb-6 text-sm text-muted">{year.length} in the year ahead · {missing.length} {missing.length === 1 ? 'person has' : 'people have'} none yet</p>

	<section class="mb-10" aria-labelledby="year-h">
		<h2 id="year-h" class="mb-2 text-lg font-semibold">The year ahead</h2>
		{#each byMonth as m (m.label)}
			<h3 class="mt-4 mb-1 border-b border-line pb-1 text-xs font-semibold tracking-wider text-muted uppercase">{m.label}</h3>
			<ul>
				{#each m.items as b (b.contact.id)}
					<li>
						<a href="/contacts/{b.contact.id}" class="-mx-2 flex min-h-12 items-center gap-3 rounded-[var(--radius-input)] px-2 hover:bg-surface-2">
							<Avatar id={b.contact.id} name={b.contact.name} initials={b.contact.initials} color={b.contact.color} hasPhoto={b.contact.hasPhoto} size="size-8" text="text-xs" />
							<!-- Phone: date under the name, so names are never cut short. Wider: date on the right. -->
							<span class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3">
								<span class="truncate">{b.contact.name}</span>
								<span class="text-sm tabular sm:shrink-0 sm:text-right {b.info.daysUntil <= 7 ? 'font-semibold text-attention' : 'text-muted'}" title={fullDate(b.info.nextIso)}>
									{b.info.label.replace(/, \d{4}$/, '')}{b.info.nextAge !== null ? ` · turns ${b.info.nextAge}` : ''} · {when(b.info.daysUntil)}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted">No birthdays yet. Add some below.</p>
		{/each}
	</section>

	<section aria-labelledby="missing-h">
		<div class="mb-1 flex flex-wrap items-baseline justify-between gap-2">
			<h2 id="missing-h" class="text-lg font-semibold">No birthday yet <span class="text-base font-normal text-muted tabular">{missing.length}</span></h2>
		</div>
		<p class="mb-3 text-sm text-muted">Pick a month and day; the year is optional. Monica adds a yearly reminder for each.</p>
		{#if missing.length > 6}
			<label class="sr-only" for="find">Find a person</label>
			<input id="find" type="search" placeholder="Find a person" bind:value={search} class="mb-3 h-10 w-full rounded-[var(--radius-input)] border border-control bg-surface px-3" />
		{/if}
		<ul class="divide-y divide-line border-y border-line" data-testid="missing">
			{#each shownMissing as c (c.id)}
				{@const e = entry(c.id)}
				{@const err = problem(c.id)}
				<li id="missing-{c.id}" class="py-2.5 {focusId === c.id ? 'bg-accent-soft' : ''}">
					<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
						<a href="/contacts/{c.id}" class="flex min-w-[10rem] flex-1 items-center gap-3">
							<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-8" text="text-xs" />
							<span class="truncate">{c.name}</span>
						</a>
						<div class="flex items-center gap-1.5">
							<label class="sr-only" for="m-{c.id}">Month for {c.name}</label>
							<select id="m-{c.id}" class="{field} w-[7.5rem]" value={e.month} onchange={(ev) => setEntry(c.id, 'month', ev.currentTarget.value)}>
								<option value="">Month</option>
								{#each MONTHS as name, i (i)}<option value={String(i + 1)}>{name}</option>{/each}
							</select>
							<label class="sr-only" for="d-{c.id}">Day for {c.name}</label>
							<select id="d-{c.id}" class="{field} w-[4.5rem]" value={e.day} onchange={(ev) => setEntry(c.id, 'day', ev.currentTarget.value)}>
								<option value="">Day</option>
								{#each Array.from({ length: e.month ? daysInMonth(+e.month, e.year ? +e.year : null) : 31 }, (_, i) => i + 1) as d (d)}<option value={String(d)}>{d}</option>{/each}
							</select>
							<label class="sr-only" for="y-{c.id}">Year for {c.name} (optional)</label>
							<input id="y-{c.id}" class="{field} w-[5rem] tabular" inputmode="numeric" maxlength="4" placeholder="Year" value={e.year} oninput={(ev) => setEntry(c.id, 'year', ev.currentTarget.value.replace(/\D/g, ''))} />
						</div>
					</div>
					{#if err}<p class="mt-1 text-sm text-attention">{err}</p>{:else if started(c.id) && !err}<p class="mt-1 text-sm text-accent">✓ Ready</p>{/if}
				</li>
			{:else}
				<li class="py-6 text-center text-sm text-muted">{missing.length ? 'No one matches.' : 'Everyone has a birthday. 🎉'}</li>
			{/each}
		</ul>
	</section>
</div>

{#if ready.length}
	<div class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface px-4 py-3 lg:bottom-0 lg:left-56" data-testid="birthday-bar">
		<div class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
			<p class="text-sm"><span class="font-semibold">{ready.length}</span> {ready.length === 1 ? 'birthday' : 'birthdays'} ready</p>
			<div class="flex gap-2">
				<button type="button" class="h-9 rounded-[var(--radius-input)] border border-accent-solid px-4 text-accent" onclick={() => (previewOpen = true)}>Preview</button>
				<button type="button" class="h-9 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent" onclick={() => (previewOpen = true)}>Save…</button>
			</div>
		</div>
		{#if data.readOnly || data.dryRun}<p class="mx-auto mt-1 max-w-3xl text-xs text-muted">{data.readOnly ? 'orbit is read-only right now, so saving will be refused.' : 'Dry run is on: nothing will reach Monica.'}</p>{/if}
	</div>
{/if}

{#if previewOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Preview">
		<div class="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<h2 class="text-lg font-semibold">Save {requests.length} {requests.length === 1 ? 'birthday' : 'birthdays'} to Monica?</h2>
			<p class="mt-1 text-sm text-muted">One update per person. Only the birthday changes; the other fields are sent back exactly as they are, because Monica would otherwise clear them.</p>
			<ol class="mt-3 flex flex-col gap-3" data-testid="preview">
				{#each requests as r, i (r.path)}
					<li>
						<p class="mb-1 text-sm font-semibold">{i + 1}. {r.name}</p>
						<pre class="overflow-x-auto rounded-[var(--radius-input)] bg-surface-2 p-3 text-sm break-words whitespace-pre-wrap">PUT {r.path}
{JSON.stringify(r.body, null, 2)}</pre>
					</li>
				{/each}
			</ol>
			<p class="mt-2 text-sm text-muted">Nothing has been sent yet. Each contact is read again just before saving; anyone who already has a birthday, or changed in the meantime, is left alone.</p>
			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						previewOpen = false;
						const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as typeof outcome;
						outcome = d ?? { ok: false, message: 'Something went wrong; some birthdays may not have been saved. Check the audit log.', saved: [] };
						const savedIds = new Set(outcome.saved);
						entries = Object.fromEntries(Object.entries(entries).filter(([id]) => !savedIds.has(Number(id))));
						await update({ reset: false });
						window.scrollTo({ top: 0 });
					};
				}}
			>
				<input type="hidden" name="draft" value={draftJson} />
				<button type="submit" disabled={saving} class="mt-3 h-11 w-full rounded-[var(--radius-input)] bg-accent-solid font-semibold text-on-accent disabled:opacity-60">
					{saving ? 'Saving…' : `Save to Monica (${requests.length})`}
				</button>
			</form>
			<button type="button" disabled={saving} class="mt-2 h-11 w-full rounded-[var(--radius-input)] border border-control" onclick={() => (previewOpen = false)}>Back</button>
		</div>
	</div>
{/if}
