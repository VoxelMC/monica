<script lang="ts">
	import ReminderList from '#lib/components/ReminderList.svelte';
	import { formatDue } from '#lib/reminders.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let notice = $state<{ ok: boolean; message: string } | null>(null);
</script>

<svelte:head><title>Reminders · orbit</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
	<h1 class="pt-2 pb-1 text-2xl font-semibold">Reminders</h1>
	<p class="mb-3 text-sm text-muted">Timed reminders you set from a person’s page (“Remind me…”). They are kept in orbit, not in Monica, and arrive on your phone through ntfy.</p>
	{#if !data.ntfyConfigured}
		<p class="mb-3 rounded-[var(--radius-card)] border border-attention p-3 text-sm text-attention" data-testid="ntfy-off">
			Phone notifications are off: ORBIT_NTFY_URL is not set. Reminders are kept and go out once it is (see DEPLOY.md, “Reminders”).
		</p>
	{/if}
	{#if notice}<p class="mb-3 text-sm {notice.ok ? 'text-muted' : 'text-attention'}" role="status">{notice.message}</p>{/if}

	<section class="rounded-[var(--radius-card)] border border-line bg-surface p-4">
		<h2 class="mb-2 text-base font-semibold">Open</h2>
		{#if data.open.length}
			<ReminderList items={data.open} onresult={(r) => (notice = r)} />
		{:else}
			<p class="text-sm text-muted">None. Open someone’s page and tap “Remind me…”.</p>
		{/if}
	</section>

	{#if data.done.length}
		<section class="mt-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
			<h2 class="mb-2 text-base font-semibold">Recently done</h2>
			<ul class="flex flex-col divide-y divide-line text-sm">
				{#each data.done as r (r.id)}
					<li class="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
						<span class="min-w-0 truncate"><a href="/contacts/{r.monicaContactId}" class="hover:underline">{r.contactName}</a>{#if r.note}<span class="text-muted">{' · '}{r.note}</span>{/if}</span>
						<span class="shrink-0 text-muted tabular">{formatDue(r.dueAt, r.timeZone)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
