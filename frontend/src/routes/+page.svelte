<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import ReminderList from '#lib/components/ReminderList.svelte';
	import RefreshButton from '#lib/components/RefreshButton.svelte';
	import { fullDate, relativeDate } from '#lib/contacts.js';
	import { catchUpSoon, recentlyChanged, upcomingBirthdays } from '#lib/dashboard.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Computed in the browser too, so "today" is the viewer's day, not the server's.
	const birthdays = $derived(upcomingBirthdays(data.contacts));
	// After the 30-day window: the next few, so the card is never just "none".
	const later = $derived(upcomingBirthdays(data.contacts, new Date(), 366).filter((b) => b.info.daysUntil > 30).slice(0, 3));
	const noBirthday = $derived(data.contacts.filter((c) => !c.birthday).length);
	const overdue = $derived(catchUpSoon(data.contacts));
	const recent = $derived(recentlyChanged(data.contacts, 5));
	const hasTargets = $derived(data.contacts.some((c) => c.stayInTouchDays));

	const when = (d: number) => (d === 0 ? 'Today 🎉' : d === 1 ? 'Tomorrow' : `In ${d} days`);
</script>

<svelte:head><title>Home · orbit</title></svelte:head>

{#snippet section(title: string, count: number, body: import('svelte').Snippet, testid: string)}
	<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4" data-testid={testid}>
		<h2 class="mb-2 flex items-center gap-2 text-base font-semibold">
			{title}
			{#if count}<span class="rounded-[var(--radius-chip)] bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">{count}</span>{/if}
		</h2>
		{@render body()}
	</section>
{/snippet}

{#snippet person(c: (typeof data.contacts)[number], line: string, lineClass = 'text-muted', title?: string)}
	<li>
		<a href="/contacts/{c.id}" class="-mx-2 flex min-h-14 items-center gap-3 rounded-[var(--radius-input)] px-2 hover:bg-surface-2">
			<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} photoKey={c.photoKey} size="size-10" />
			<span class="min-w-0 flex-1">
				<span class="block truncate font-medium">{c.name}</span>
				<span class="block truncate text-sm {lineClass}" {title}>{line}</span>
			</span>
		</a>
	</li>
{/snippet}

<div class="mx-auto max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<div class="flex items-center justify-between pt-2 pb-3">
		<h1 class="text-2xl font-semibold">Home</h1>
		<div class="flex items-center">
			<RefreshButton />
			<a href="/log" class="inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-3 text-accent lg:hidden">+ Log</a>
		</div>
	</div>

	<div class="grid gap-3 lg:grid-cols-2">
		{#if data.reminders.length}
			{#snippet remindersBody()}
				<ReminderList items={data.reminders} />
				<a href="/reminders" class="mt-2 inline-block text-sm text-accent">All reminders</a>
				{#if !data.ntfyConfigured}<p class="mt-1 text-xs text-attention">Phone notifications are off (ORBIT_NTFY_URL not set).</p>{/if}
			{/snippet}
			{@render section('Reminders', data.reminders.length, remindersBody, 'timed-reminders')}
		{/if}
		{#snippet bdays()}
			{#snippet sub(label: string)}
				<h3 class="mt-1 mb-1 text-xs font-semibold tracking-wider text-muted uppercase">{label}</h3>
			{/snippet}
			{@render sub('Next 30 days')}
			{#if birthdays.length}
				<ul>
					{#each birthdays as b (b.contact.id)}
						{@render person(
							b.contact,
							`${when(b.info.daysUntil)} · ${b.info.label}${b.info.nextAge !== null ? ` · turns ${b.info.ageIsApprox ? '~' : ''}${b.info.nextAge}` : ''}`,
							b.info.daysUntil <= 7 ? 'text-attention font-medium' : 'text-muted',
							fullDate(b.info.nextIso)
						)}
					{/each}
				</ul>
			{:else}
				<p class="pb-1 text-sm text-muted">None in the next 30 days.</p>
			{/if}
			{#if later.length}
				<div class="mt-3 border-t border-line pt-3">
					{@render sub('Later')}
					<ul>
						{#each later as b (b.contact.id)}
							{@render person(b.contact, `In ${b.info.daysUntil} days · ${b.info.label}`, 'text-muted', fullDate(b.info.nextIso))}
						{/each}
					</ul>
				</div>
			{/if}
			<div class="mt-3 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-sm">
				<a href="/birthdays" class="text-accent">All birthdays →</a>
				{#if noBirthday}<a href="/birthdays#missing-h" class="text-muted hover:text-fg">{noBirthday} without a birthday · Add</a>{/if}
			</div>
		{/snippet}
		{@render section('Birthdays', birthdays.length, bdays, 'birthdays')}

		{#snippet catchup()}
			{#if overdue.length}
				<ul>
					{#each overdue as o (o.contact.id)}
						{@render person(
							o.contact,
							o.daysSince === null ? `Never logged · target every ${o.targetDays} days` : `Last contact ${o.daysSince} days ago · target ${o.targetDays}`,
							'text-attention'
						)}
					{/each}
				</ul>
			{:else if hasTargets}
				<p class="text-sm text-muted">Everyone is within their catch-up target. 🎉</p>
			{:else}
				<p class="text-sm text-muted">No catch-up targets yet. Set “Stay in touch” on a contact in Monica; orbit’s own targets arrive in slice 5.</p>
			{/if}
		{/snippet}
		{@render section('Catch up soon', overdue.length, catchup, 'catch-up')}

		{#snippet tasksBody()}
			{#if data.tasks.length}
				<ul class="flex flex-col gap-2">
					{#each data.tasks.slice(0, 10) as t (t.id)}
						<li class="flex gap-2 text-sm">
							<span aria-hidden="true">☐</span>
							<div class="min-w-0">
								<p>{t.title}</p>
								{#if t.contact}<a href="/contacts/{t.contact.id}" class="text-accent">{t.contact.name}</a>{/if}
								{#if t.description}<p class="text-muted">{t.description}</p>{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if data.tasks.length > 10}<p class="mt-2 text-sm text-muted">and {data.tasks.length - 10} more</p>{/if}
			{:else}
				<p class="text-sm text-muted">No open tasks.</p>
			{/if}
		{/snippet}
		{@render section('Open tasks', data.tasks.length, tasksBody, 'tasks')}

		{#snippet recentBody()}
			<ul>
				{#each recent as r (r.contact.id)}
					{@render person(r.contact, `${r.kind === 'added' ? 'Added' : 'Updated'} ${relativeDate(r.at)}`, 'text-muted', fullDate(r.at))}
				{/each}
			</ul>
		{/snippet}
		{@render section('Recently added or updated', 0, recentBody, 'recent')}
	</div>

	<p class="mt-8 flex justify-center gap-6 text-sm lg:hidden"><a href="/reminders" class="text-muted underline underline-offset-2">Reminders</a><a href="/settings" class="text-muted underline underline-offset-2">Settings</a><a href="/health" class="text-muted underline underline-offset-2">System health</a></p>
</div>
