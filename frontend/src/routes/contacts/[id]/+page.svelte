<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ConfirmRemove from '#lib/components/ConfirmRemove.svelte';
	import PhotoPicker from '#lib/components/PhotoPicker.svelte';
	import Tag from '#lib/components/Tag.svelte';
	import type { TimelineItem } from '#lib/contact.js';
	import { SvelteSet } from 'svelte/reactivity';
	import { fullDate, relativeDate } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.contact);

	const kindLabel = { note: 'Note', activity: 'Catch-up', call: 'Call', conversation: 'Conversation' } as const;
	const kindDot = { note: 'bg-dot-note', activity: 'bg-dot-activity', call: 'bg-dot-call', conversation: 'bg-dot-conversation' } as const;

	// ---- Timeline: events only (notes have their own section), filterable, shortened
	type EventKind = 'activity' | 'call' | 'conversation';
	const kindPlural: Record<EventKind, string> = { activity: 'Catch-ups', call: 'Calls', conversation: 'Conversations' };
	const events = $derived(c.timeline.filter((i) => i.kind !== 'note'));
	const notes = $derived(c.timeline.filter((i) => i.kind === 'note'));
	const kindsPresent = $derived((['activity', 'call', 'conversation'] as const).filter((k) => events.some((e) => e.kind === k)));
	let filter = $state<'all' | EventKind>('all');
	const filtered = $derived(filter === 'all' ? events : events.filter((e) => e.kind === filter));
	let showAllEvents = $state(false);
	let showAllNotes = $state(false);
	const EVENTS_SHOWN = 10;
	const NOTES_SHOWN = 5;
	const expanded = new SvelteSet<number>();
	// Notes can be folded; the choice is remembered on this device.
	let notesOpen = $state(true);
	$effect(() => {
		try {
			notesOpen = localStorage.getItem('orbit-notes-open') !== 'false';
		} catch {
			/* storage unavailable: stay open */
		}
	});
	function toggleNotes(e: Event) {
		notesOpen = (e.currentTarget as HTMLDetailsElement).open;
		try {
			localStorage.setItem('orbit-notes-open', String(notesOpen));
		} catch {
			/* ignore */
		}
	}
	let removing = $state<TimelineItem | null>(null);
	let notice = $state<{ ok: boolean; message: string } | null>(null);
	// A new contact page (e.g. via a relationship link) starts fresh
	$effect(() => {
		void c.id;
		filter = 'all';
		showAllEvents = false;
		showAllNotes = false;
		expanded.clear();
	});
	const giftStatus: Record<string, string> = { idea: 'Idea', offered: 'Given', received: 'Received' };

	function birthdayLine(b: NonNullable<typeof c.birthday>): string {
		const when = b.daysUntil === 0 ? 'today 🎉' : b.daysUntil === 1 ? 'tomorrow' : `in ${b.daysUntil} days`;
		return b.nextAge !== null ? `Turns ${b.ageIsApprox ? 'about ' : ''}${b.nextAge} ${when}` : `Birthday ${when}`;
	}
</script>

<svelte:head><title>{c.name} · orbit</title></svelte:head>

{#snippet card(title: string, body: import('svelte').Snippet)}
	<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4">
		<h2 class="mb-2 text-base font-semibold">{title}</h2>
		{@render body()}
	</section>
{/snippet}

{#snippet fold(title: string, count: number, body: import('svelte').Snippet, open = false)}
	<!-- Personal sections fold away; the count says what is inside without opening. -->
	<details {open} class="group rounded-[var(--radius-card)] border border-line bg-surface">
		<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-semibold select-none [&::-webkit-details-marker]:hidden">
			<span>{title}{#if count}<span class="ml-2 rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{count}</span>{/if}</span>
			<svg viewBox="0 0 24 24" class="size-4 transition-transform duration-150 group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
		</summary>
		<div class="px-4 pb-4">{@render body()}</div>
	</details>
{/snippet}

{#snippet fieldRow(label: string, value: string, href: string | null, external = false)}
	<li>
		{#if href}
			<a
				{href}
				target={external ? '_blank' : undefined}
				rel={external ? 'noopener noreferrer' : undefined}
				class="-mx-2 flex min-h-11 flex-col justify-center rounded-[var(--radius-input)] px-2 hover:bg-surface-2"
			>
				<span class="text-xs text-muted">{label}</span>
				<span class="break-all text-accent">{value}</span>
			</a>
		{:else}
			<div class="flex min-h-11 flex-col justify-center">
				<span class="text-xs text-muted">{label}</span>
				<span class="break-all">{value}</span>
			</div>
		{/if}
	</li>
{/snippet}

<div class="mx-auto max-w-5xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-6">
	<nav class="flex items-center justify-between py-2">
		<a href="/contacts" class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-input)] px-2 text-accent" onclick={(e) => { if (history.length > 1 && document.referrer.includes('/contacts')) { e.preventDefault(); history.back(); } }}>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
			People
		</a>
		{#if data.monicaLink}
			<a href={data.monicaLink} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-2 text-sm text-muted hover:bg-surface-2">
				Open in Monica ↗
			</a>
		{/if}
	</nav>

	<!-- Header -->
	<header class="flex items-center gap-4 py-3">
		<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} photoKey={c.photoKey} size="size-20" text="text-2xl" />
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold break-words">{c.name}{#if c.isDead}<span class="ml-2 text-base font-normal text-muted">(deceased)</span>{/if}</h1>
			{#if c.nickname}<p class="text-muted">“{c.nickname}”</p>{/if}
			{#if c.job || c.company}<p class="text-sm text-muted">{[c.job, c.company].filter(Boolean).join(' at ')}</p>{/if}
			<div class="mt-1 flex flex-wrap gap-x-4">
				{#if !c.birthday && !c.isDead}
					<a href="/birthdays?contact={c.id}" class="text-sm text-accent">+ Add birthday</a>
				{/if}
				<PhotoPicker contactId={c.id} updatedAt={c.updatedAt} name={c.name} ondone={(r) => (notice = r)} />
			</div>
			{#if c.birthday}
				<p class="mt-1 text-sm" data-testid="birthday">
					<span class={c.birthday.daysUntil <= 30 ? 'font-medium text-attention' : 'text-muted'}>{birthdayLine(c.birthday)}</span>
					<span class="text-muted"> · {c.birthday.label}{#if c.birthday.age !== null} · {c.birthday.ageIsApprox ? '~' : ''}{c.birthday.age} y/o{/if}</span>
				</p>
			{/if}
		</div>
	</header>
	{#if c.tags.length}
		<ul class="mb-3 flex flex-wrap gap-1" aria-label="Tags">
			{#each c.tags as t (t)}
				<li><Tag name={t} href="/contacts?tag={encodeURIComponent(t)}" size="md" /></li>
			{/each}
		</ul>
	{/if}
	<a href="/log?people={c.id}" class="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-input)] border border-accent-solid font-medium text-accent">
		<span aria-hidden="true">+</span> Log a catch-up
	</a>
	{#if c.description}<p class="mb-3 whitespace-pre-line text-fg">{c.description}</p>{/if}

	<div class="grid gap-3 lg:grid-cols-[1fr_20rem]">
		<div class="flex min-w-0 flex-col gap-3">
			<!-- Contact fields -->
			{#if c.phones.length || c.emails.length || c.otherFields.length || c.addresses.length}
				{#snippet fieldsBody()}
					<ul class="flex flex-col gap-1">
						{#each c.phones as f, i (i)}{@render fieldRow(f.label, f.value, f.href)}{/each}
						{#each c.emails as f, i (i)}{@render fieldRow(f.label, f.value, f.href)}{/each}
						{#each c.otherFields as f, i (i)}{@render fieldRow(f.label, f.value, f.href, true)}{/each}
						{#each c.addresses as a, i (i)}{@render fieldRow(a.label, a.lines.join(', '), a.href, true)}{/each}
					</ul>
				{/snippet}
				{@render card('Contact', fieldsBody)}
			{/if}

			{#if notice}
				<p class="rounded-[var(--radius-card)] border p-3 text-sm {notice.ok ? 'border-accent-solid bg-accent-soft text-on-accent-soft' : 'border-attention text-attention'}" role="status" data-testid="remove-notice">
					{notice.message} <a class="underline" href="/audit">Audit log</a>
				</p>
			{/if}

			<!-- Reminders: open and first, so they are seen without a tap -->
			{#if c.reminders.length}
				<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4" aria-labelledby="reminders-h" data-testid="reminders">
					<h2 id="reminders-h" class="mb-2 text-base font-semibold">Reminders</h2>
					<ul class="flex flex-col divide-y divide-line">
						{#each c.reminders as r (r.id)}
							<li class="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
								<span class="min-w-0">
									<span class="block">{r.title}</span>
									<span class="block text-sm text-muted">{r.frequency}</span>
								</span>
								{#if r.next !== null && r.daysUntil !== null}
									<time
										datetime={r.next}
										title={fullDate(r.next)}
										class="shrink-0 text-sm tabular {r.daysUntil <= 7 ? 'font-semibold text-attention' : 'text-muted'}"
									>{r.daysUntil === 0 ? 'Today' : r.daysUntil === 1 ? 'Tomorrow' : `In ${r.daysUntil} days`} · {fullDate(r.next)}</time>
								{:else}
									<span class="shrink-0 text-sm text-muted">Done</span>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Timeline: catch-ups, calls and conversations (notes are below) -->
			{#snippet timelineBody()}
				{#if kindsPresent.length > 1}
					<div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Show">
						{#each [['all', 'All', events.length], ...kindsPresent.map((k) => [k, kindPlural[k], events.filter((e) => e.kind === k).length])] as [k, label, n] (k)}
							<button
								type="button"
								aria-pressed={filter === k}
								class="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-chip)] border px-2.5 text-sm {filter === k ? 'border-accent-solid bg-accent-solid text-on-accent' : 'border-control bg-surface text-fg'}"
								onclick={() => ((filter = k as typeof filter), (showAllEvents = false))}
							>
								{#if k !== 'all'}<span class="size-2 rounded-[2px] {kindDot[k as EventKind]}" aria-hidden="true"></span>{/if}{label}
								<span class="text-xs tabular opacity-80">{n}</span>
							</button>
						{/each}
					</div>
				{/if}
				{#if filtered.length}
					<ol class="flex flex-col gap-4" data-testid="timeline">
						{#each showAllEvents ? filtered : filtered.slice(0, EVENTS_SHOWN) as item (item.kind + item.id)}
							<li class="flex gap-3">
								<span class="mt-1.5 size-2.5 shrink-0 rounded-[var(--radius-chip)] {kindDot[item.kind]}" aria-hidden="true"></span>
								<div class="min-w-0 flex-1">
									<p class="text-sm">
										<span class="font-medium">{item.title}</span>
										{#if item.title !== kindLabel[item.kind]}<span class="text-muted"> · {kindLabel[item.kind]}</span>{/if}
									</p>
									<p class="text-xs text-muted">
										<time datetime={item.date} title={fullDate(item.date)}>{relativeDate(item.date)}</time>
										{#if item.kind === 'activity' && item.updatedAt}· <button type="button" class="text-attention underline-offset-2 hover:underline" onclick={() => ((removing = item), (notice = null))}>Remove…</button>{/if}
									</p>
									{#if item.body}<p class="mt-1 text-sm break-words whitespace-pre-line text-fg">{item.body}</p>{/if}
								</div>
							</li>
						{/each}
					</ol>
					{#if filtered.length > EVENTS_SHOWN}
						<button type="button" class="mt-3 text-sm text-accent" onclick={() => (showAllEvents = !showAllEvents)}>
							{showAllEvents ? 'Show fewer' : `Show all ${filtered.length}`}
						</button>
					{/if}
				{:else}
					<p class="text-sm text-muted">No catch-ups or calls yet. <a href="/log?people={c.id}" class="text-accent">Log one</a></p>
				{/if}
			{/snippet}
			{@render card('Timeline', timelineBody)}

			<!-- Notes: their own section, newest first, long ones folded -->
			{#snippet notesBody()}
				{#if notes.length}
					<ol class="flex flex-col divide-y divide-line" data-testid="notes">
						{#each showAllNotes ? notes : notes.slice(0, NOTES_SHOWN) as n (n.id)}
							{@const long = (n.body ?? '').length > 280 || (n.body ?? '').split('\n').length > 5}
							<li class="py-3 first:pt-0 last:pb-0">
								<p class="mb-1 text-xs text-muted">
									<time datetime={n.date} title={fullDate(n.date)}>{relativeDate(n.date)}</time>
									{#if n.updatedAt}· <button type="button" class="text-attention underline-offset-2 hover:underline" onclick={() => ((removing = n), (notice = null))}>Remove…</button>{/if}
								</p>
								<p class="text-sm break-words whitespace-pre-line {long && !expanded.has(n.id) ? 'line-clamp-4' : ''}">{n.body}</p>
								{#if long}
									<button type="button" class="mt-1 text-sm text-accent" onclick={() => (expanded.has(n.id) ? expanded.delete(n.id) : expanded.add(n.id))}>
										{expanded.has(n.id) ? 'Show less' : 'Show more'}
									</button>
								{/if}
							</li>
						{/each}
					</ol>
					{#if notes.length > NOTES_SHOWN}
						<button type="button" class="mt-3 text-sm text-accent" onclick={() => (showAllNotes = !showAllNotes)}>
							{showAllNotes ? 'Show fewer' : `Show all ${notes.length} notes`}
						</button>
					{/if}
				{:else}
					<p class="text-sm text-muted">No notes yet.</p>
				{/if}
			{/snippet}
			{#if data.mentionedIn.length}
				{#snippet mentionedBody()}
					<ul class="flex flex-col gap-1" data-testid="mentioned-in">
						{#each data.mentionedIn as e (e.id)}
							<li class="flex items-baseline justify-between gap-3 text-sm">
								<a href="/diary" class="truncate text-accent">{e.title}</a>
								<time class="shrink-0 text-xs text-muted" datetime={e.date} title={fullDate(e.date)}>{relativeDate(e.date)}</time>
							</li>
						{/each}
					</ul>
				{/snippet}
				{@render card('Mentioned in journal', mentionedBody)}
			{/if}

			<details open={notesOpen} ontoggle={toggleNotes} class="group rounded-[var(--radius-card)] border border-line bg-surface" data-testid="notes-section">
				<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-semibold select-none [&::-webkit-details-marker]:hidden">
					<span>Notes{#if notes.length}<span class="ml-2 rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{notes.length}</span>{/if}</span>
					<svg viewBox="0 0 24 24" class="size-4 transition-transform duration-150 group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
				</summary>
				<div class="px-4 pb-4">{@render notesBody()}</div>
			</details>
		</div>

		<!-- Side panels -->
		<aside class="flex flex-col gap-3">
			{#snippet relBody()}
				{#if c.relationships.length}
					<ul class="flex flex-col gap-1">
						{#each c.relationships as r, i (i)}
							<li class="flex min-h-11 items-center justify-between gap-2">
								{#if r.partial}<span>{r.name}</span>{:else}<a href="/contacts/{r.contactId}" class="text-accent">{r.name}</a>{/if}
								<span class="text-sm text-muted">{r.type}</span>
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-muted">No relationships yet.</p>{/if}
			{/snippet}
			{@render card('Relationships', relBody)}

			{#snippet taskBody()}
				{#if c.tasks.length}
					<ul class="flex flex-col gap-2">
						{#each c.tasks as t (t.id)}
							<li class="flex gap-2 text-sm">
								<span aria-hidden="true">{t.completed ? '☑' : '☐'}</span>
								<div class:line-through={t.completed} class:text-muted={t.completed}>
									{t.title}<span class="sr-only">{t.completed ? ' (done)' : ' (open)'}</span>
									{#if t.description}<p class="text-xs text-muted">{t.description}</p>{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-muted">No tasks.</p>{/if}
			{/snippet}
			{@render fold('Tasks', c.tasks.filter((t) => !t.completed).length, taskBody, c.tasks.some((t) => !t.completed))}

			{#snippet giftBody()}
				{#if c.gifts.length}
					<ul class="flex flex-col gap-2">
						{#each c.gifts as g (g.id)}
							<li class="text-sm">
								<div class="flex justify-between gap-2">
									{#if g.href}<a href={g.href} target="_blank" rel="noopener noreferrer" class="text-accent">{g.name}</a>{:else}<span>{g.name}</span>{/if}
									{#if g.status}<span class="text-xs text-muted">{giftStatus[g.status] ?? g.status}</span>{/if}
								</div>
								{#if g.amount || g.comment}<p class="text-xs text-muted">{[g.amount, g.comment].filter(Boolean).join(' · ')}</p>{/if}
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-muted">No gifts or ideas yet.</p>{/if}
			{/snippet}
			{@render fold('Gifts', c.gifts.length, giftBody)}

			{#if c.howYouMet || c.foodPreferences}
				{#snippet moreBody()}
					<dl class="flex flex-col gap-2 text-sm">
						{#if c.howYouMet}<div><dt class="text-xs text-muted">How you met</dt><dd class="whitespace-pre-line">{c.howYouMet}</dd></div>{/if}
						{#if c.foodPreferences}<div><dt class="text-xs text-muted">Food preferences</dt><dd class="whitespace-pre-line">{c.foodPreferences}</dd></div>{/if}
					</dl>
				{/snippet}
				{@render fold('About', 0, moreBody)}
			{/if}
		</aside>
	</div>
</div>

{#if removing}
	<ConfirmRemove
		kind={removing.kind === 'note' ? 'note' : 'activity'}
		id={removing.id}
		updatedAt={removing.updatedAt ?? ''}
		title={removing.kind === 'note' ? `Note on ${c.name}’s page` : removing.title}
		details={[fullDate(removing.date), removing.body ?? '']}
		warning={removing.kind === 'activity' ? 'It disappears for everyone who was there. Notes written about them stay.' : ''}
		onclose={() => (removing = null)}
		ondone={(r) => ((notice = r), (removing = null))}
	/>
{/if}
