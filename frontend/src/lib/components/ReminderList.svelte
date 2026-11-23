<script lang="ts">
	// Open timed reminders with Done / Later / Remove. Posts to /reminders actions
	// (orbit's own database; Monica is not touched).
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { formatDue, relativeDue } from '#lib/reminders.js';

	interface Item {
		id: number;
		monicaContactId: number;
		contactName: string;
		note: string;
		dueAt: string;
		timeZone: string;
		sentAt: string | null;
		lastError: string | null;
		attempts: number;
	}
	interface Props {
		items: Item[];
		/** Show the person's name (Home, Reminders page); not needed on their own page. */
		showName?: boolean;
		onresult?: (result: { ok: boolean; message: string }) => void;
	}
	let { items, showName = true, onresult }: Props = $props();
	let now = $state(new Date());
	$effect(() => {
		const t = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(t);
	});

	// Posts to /reminders from any page: stay put and refresh this page's data
	const handle = () => {
		return async ({ result }: { result: { type: string; data?: unknown } }) => {
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
			if (d) onresult?.(d);
			await refreshAll();
		};
	};
	const small = 'min-h-9 rounded-[var(--radius-input)] px-2 text-sm hover:bg-surface-2';
</script>

<ul class="flex flex-col divide-y divide-line" data-testid="reminder-list">
	{#each items as r (r.id)}
		{@const overdue = Date.parse(r.dueAt) <= now.getTime()}
		<li class="py-2 first:pt-0 last:pb-0">
			<div class="flex items-baseline justify-between gap-3">
				<div class="min-w-0">
					{#if showName}<a href="/contacts/{r.monicaContactId}" class="font-medium hover:underline">{r.contactName}</a>{/if}
					{#if r.note}<p class="break-words {showName ? 'text-sm' : ''}">{r.note}</p>{:else if !showName}<p class="text-muted">Reminder</p>{/if}
				</div>
				<span class="shrink-0 text-right text-sm tabular {overdue && !r.sentAt ? 'font-medium text-attention' : 'text-muted'}">
					{formatDue(r.dueAt, r.timeZone, now)}
					<span class="block text-xs">{r.sentAt ? 'sent ✓' : relativeDue(r.dueAt, now)}</span>
				</span>
			</div>
			{#if r.lastError && !r.sentAt}
				<p class="mt-1 text-xs text-attention">Not sent yet ({r.attempts} {r.attempts === 1 ? 'try' : 'tries'}): {r.lastError}. orbit keeps trying.</p>
			{/if}
			<div class="mt-1 -ml-2 flex flex-wrap gap-1">
				<form method="POST" action="/reminders?/done" use:enhance={handle}>
					<input type="hidden" name="id" value={r.id} />
					<button class="{small} font-medium text-accent" data-testid="reminder-done">Done</button>
				</form>
				<form method="POST" action="/reminders?/snooze" use:enhance={handle}>
					<input type="hidden" name="id" value={r.id} />
					<input type="hidden" name="minutes" value="60" />
					<button class={small}>+1 hour</button>
				</form>
				<form method="POST" action="/reminders?/snooze" use:enhance={handle}>
					<input type="hidden" name="id" value={r.id} />
					<input type="hidden" name="minutes" value="1440" />
					<button class={small}>+1 day</button>
				</form>
				<form method="POST" action="/reminders?/remove" use:enhance={handle}>
					<input type="hidden" name="id" value={r.id} />
					<button class="{small} text-muted" aria-label="Remove reminder">Remove</button>
				</form>
			</div>
		</li>
	{/each}
</ul>
