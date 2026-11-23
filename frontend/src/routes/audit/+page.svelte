<script lang="ts">
	import { fullDate } from '#lib/contacts.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const tone = (r: string) => (r === 'ok' ? 'text-accent' : r === 'dry-run' || r === 'pending' ? 'text-muted' : 'text-attention');
	const time = (iso: string) => `${fullDate(iso)} ${new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
</script>

<svelte:head><title>Audit log · orbit</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 lg:px-8">
	<h1 class="pt-2 pb-1 text-2xl font-semibold">Audit log</h1>
	<p class="mb-6 text-sm text-muted">
		Every write orbit sent to Monica, refused, or only dry-ran, newest first, with the record before and after.
		Read-only is <strong class={data.readOnly ? 'text-accent' : 'text-attention'}>{data.readOnly ? 'on' : 'off'}</strong>{data.dryRun ? ' · dry run on' : ''}.
	</p>

	{#if data.rows.length}
		<ol class="flex flex-col gap-2" data-testid="audit">
			{#each data.rows as r (r.id)}
				<li class="rounded-[var(--radius-card)] border border-line bg-surface">
					<details>
						<summary class="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
							<span class="font-mono text-sm">{r.method} {r.endpoint}</span>
							<span class="text-sm font-semibold {tone(r.result)}">{r.result}</span>
							<span class="ml-auto text-xs text-muted tabular">#{r.id} · {time(r.at)}</span>
						</summary>
						<div class="grid gap-3 border-t border-line p-3 md:grid-cols-2">
							<div>
								<h2 class="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">Before</h2>
								<pre class="max-h-80 overflow-auto rounded-[var(--radius-input)] bg-surface-2 p-2 text-xs whitespace-pre-wrap">{r.before ?? '—  (new record)'}</pre>
							</div>
							<div>
								<h2 class="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">{r.result === 'pending' || r.dryRun ? 'Sent / would send' : 'After (Monica’s reply)'}</h2>
								<pre class="max-h-80 overflow-auto rounded-[var(--radius-input)] bg-surface-2 p-2 text-xs whitespace-pre-wrap">{r.after ?? '—'}</pre>
								{#if r.image}<img src={r.image} alt="What was uploaded" class="mt-2 size-24 rounded-[var(--radius-photo)] object-cover" />{/if}
							</div>
						</div>
					</details>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="py-12 text-center text-muted">No writes yet.</p>
	{/if}
</div>
