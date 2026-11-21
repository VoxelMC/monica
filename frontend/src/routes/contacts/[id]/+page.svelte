<script lang="ts">
	import Avatar from '#lib/components/Avatar.svelte';
	import { fullDate, relativeDate } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.contact);

	const kindLabel = { note: 'Note', activity: 'Catch-up', call: 'Call', conversation: 'Conversation' } as const;
	const kindDot = { note: 'bg-amber-400', activity: 'bg-accent-500', call: 'bg-sky-500', conversation: 'bg-violet-500' } as const;
	const giftStatus: Record<string, string> = { idea: 'Idea', offered: 'Given', received: 'Received' };

	function birthdayLine(b: NonNullable<typeof c.birthday>): string {
		const when = b.daysUntil === 0 ? 'today 🎉' : b.daysUntil === 1 ? 'tomorrow' : `in ${b.daysUntil} days`;
		return b.nextAge !== null ? `Turns ${b.ageIsApprox ? 'about ' : ''}${b.nextAge} ${when}` : `Birthday ${when}`;
	}
</script>

<svelte:head><title>{c.name} · orbit</title></svelte:head>

{#snippet card(title: string, body: import('svelte').Snippet)}
	<section class="rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
		<h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h2>
		{@render body()}
	</section>
{/snippet}

{#snippet fold(title: string, count: number, body: import('svelte').Snippet, open = false)}
	<!-- Personal sections fold away; the count says what is inside without opening. -->
	<details {open} class="group rounded-[var(--radius-card)] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
		<summary class="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold tracking-wide text-slate-500 uppercase select-none dark:text-slate-400 [&::-webkit-details-marker]:hidden">
			<span>{title}{#if count}<span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium normal-case text-slate-600 dark:bg-slate-800 dark:text-slate-300">{count}</span>{/if}</span>
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
				class="-mx-2 flex min-h-11 flex-col justify-center rounded-[var(--radius-input)] px-2 hover:bg-slate-50 dark:hover:bg-slate-800"
			>
				<span class="text-xs text-slate-500 dark:text-slate-400">{label}</span>
				<span class="break-all text-accent-700 dark:text-accent-500">{value}</span>
			</a>
		{:else}
			<div class="flex min-h-11 flex-col justify-center">
				<span class="text-xs text-slate-500 dark:text-slate-400">{label}</span>
				<span class="break-all">{value}</span>
			</div>
		{/if}
	</li>
{/snippet}

<div class="mx-auto max-w-5xl px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-6">
	<nav class="flex items-center justify-between py-2">
		<a href="/contacts" class="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-input)] px-2 text-accent-700 dark:text-accent-500" onclick={(e) => { if (history.length > 1 && document.referrer.includes('/contacts')) { e.preventDefault(); history.back(); } }}>
			<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
			People
		</a>
		{#if data.monicaLink}
			<a href={data.monicaLink} target="_blank" rel="noopener noreferrer" class="inline-flex min-h-11 items-center rounded-[var(--radius-input)] px-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900">
				Open in Monica ↗
			</a>
		{/if}
	</nav>

	<!-- Header -->
	<header class="flex items-center gap-4 py-3">
		<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-20" text="text-2xl" />
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold break-words">{c.name}{#if c.isDead}<span class="ml-2 text-base font-normal text-slate-500">(deceased)</span>{/if}</h1>
			{#if c.nickname}<p class="text-slate-500 dark:text-slate-400">“{c.nickname}”</p>{/if}
			{#if c.job || c.company}<p class="text-sm text-slate-600 dark:text-slate-300">{[c.job, c.company].filter(Boolean).join(' at ')}</p>{/if}
			{#if c.birthday}
				<p class="mt-1 text-sm" data-testid="birthday">
					<span class={c.birthday.daysUntil <= 30 ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}>{birthdayLine(c.birthday)}</span>
					<span class="text-slate-500 dark:text-slate-400"> · {c.birthday.label}{#if c.birthday.age !== null} · {c.birthday.ageIsApprox ? '~' : ''}{c.birthday.age} y/o{/if}</span>
				</p>
			{/if}
		</div>
	</header>
	{#if c.tags.length}
		<ul class="mb-3 flex flex-wrap gap-1" aria-label="Tags">
			{#each c.tags as t (t)}
				<li><a href="/contacts?tag={encodeURIComponent(t)}" class="inline-flex min-h-8 items-center rounded-full bg-accent-50 px-3 text-sm text-accent-700 dark:bg-slate-800 dark:text-accent-500">{t}</a></li>
			{/each}
		</ul>
	{/if}
	{#if c.description}<p class="mb-3 whitespace-pre-line text-slate-700 dark:text-slate-300">{c.description}</p>{/if}

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

			<!-- Timeline -->
			{#snippet timelineBody()}
				{#if c.timeline.length}
					<ol class="flex flex-col gap-4" data-testid="timeline">
						{#each c.timeline as item (item.kind + item.id)}
							<li class="flex gap-3">
								<span class="mt-1.5 size-2.5 shrink-0 rounded-full {kindDot[item.kind]}" aria-hidden="true"></span>
								<div class="min-w-0 flex-1">
									<p class="text-sm">
										<span class="font-medium">{item.title}</span>
										{#if item.title !== kindLabel[item.kind]}<span class="text-slate-500 dark:text-slate-400"> · {kindLabel[item.kind]}</span>{/if}
									</p>
									<p class="text-xs text-slate-500 dark:text-slate-400"><time datetime={item.date} title={fullDate(item.date)}>{relativeDate(item.date)}</time></p>
									{#if item.body}<p class="mt-1 text-sm break-words whitespace-pre-line text-slate-700 dark:text-slate-300">{item.body}</p>{/if}
								</div>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="text-sm text-slate-500 dark:text-slate-400">Nothing logged yet. Notes, catch-ups and calls will show up here.</p>
				{/if}
			{/snippet}
			{@render card('Timeline', timelineBody)}
		</div>

		<!-- Side panels -->
		<aside class="flex flex-col gap-3">
			{#snippet relBody()}
				{#if c.relationships.length}
					<ul class="flex flex-col gap-1">
						{#each c.relationships as r, i (i)}
							<li class="flex min-h-11 items-center justify-between gap-2">
								{#if r.partial}<span>{r.name}</span>{:else}<a href="/contacts/{r.contactId}" class="text-accent-700 dark:text-accent-500">{r.name}</a>{/if}
								<span class="text-sm text-slate-500 dark:text-slate-400">{r.type}</span>
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-slate-500 dark:text-slate-400">No relationships yet.</p>{/if}
			{/snippet}
			{@render card('Relationships', relBody)}

			{#snippet taskBody()}
				{#if c.tasks.length}
					<ul class="flex flex-col gap-2">
						{#each c.tasks as t (t.id)}
							<li class="flex gap-2 text-sm">
								<span aria-hidden="true">{t.completed ? '☑' : '☐'}</span>
								<div class:line-through={t.completed} class:text-slate-400={t.completed}>
									{t.title}<span class="sr-only">{t.completed ? ' (done)' : ' (open)'}</span>
									{#if t.description}<p class="text-xs text-slate-500">{t.description}</p>{/if}
								</div>
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-slate-500 dark:text-slate-400">No tasks.</p>{/if}
			{/snippet}
			{@render fold('Tasks', c.tasks.filter((t) => !t.completed).length, taskBody, c.tasks.some((t) => !t.completed))}

			{#snippet giftBody()}
				{#if c.gifts.length}
					<ul class="flex flex-col gap-2">
						{#each c.gifts as g (g.id)}
							<li class="text-sm">
								<div class="flex justify-between gap-2">
									{#if g.href}<a href={g.href} target="_blank" rel="noopener noreferrer" class="text-accent-700 dark:text-accent-500">{g.name}</a>{:else}<span>{g.name}</span>{/if}
									{#if g.status}<span class="text-xs text-slate-500">{giftStatus[g.status] ?? g.status}</span>{/if}
								</div>
								{#if g.amount || g.comment}<p class="text-xs text-slate-500">{[g.amount, g.comment].filter(Boolean).join(' · ')}</p>{/if}
							</li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-slate-500 dark:text-slate-400">No gifts or ideas yet.</p>{/if}
			{/snippet}
			{@render fold('Gifts', c.gifts.length, giftBody)}

			{#snippet reminderBody()}
				{#if c.reminders.length}
					<ul class="flex flex-col gap-2">
						{#each c.reminders as r (r.id)}
							<li class="text-sm">{r.title}<p class="text-xs text-slate-500"><time datetime={r.date}>{fullDate(r.date)}</time> · {r.frequency}</p></li>
						{/each}
					</ul>
				{:else}<p class="text-sm text-slate-500 dark:text-slate-400">No reminders.</p>{/if}
			{/snippet}
			{@render fold('Reminders', c.reminders.length, reminderBody)}

			{#if c.howYouMet || c.foodPreferences}
				{#snippet moreBody()}
					<dl class="flex flex-col gap-2 text-sm">
						{#if c.howYouMet}<div><dt class="text-xs text-slate-500">How you met</dt><dd class="whitespace-pre-line">{c.howYouMet}</dd></div>{/if}
						{#if c.foodPreferences}<div><dt class="text-xs text-slate-500">Food preferences</dt><dd class="whitespace-pre-line">{c.foodPreferences}</dd></div>{/if}
					</dl>
				{/snippet}
				{@render fold('About', 0, moreBody)}
			{/if}
		</aside>
	</div>
</div>
