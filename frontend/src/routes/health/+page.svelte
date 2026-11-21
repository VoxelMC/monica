<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>orbit · health</title></svelte:head>

<main>
	<h1>Health</h1>

	<section class:bad={!data.me.ok}>
		<h2>Monica <code>GET /api/me</code></h2>
		{#if data.me.ok}
			<p class="status">✓ Connected ({data.me.ms} ms)</p>
			<dl>
				<dt>User</dt><dd>{data.me.name}</dd>
				<dt>Email</dt><dd>{data.me.email}</dd>
				<dt>Account</dt><dd>{data.me.accountId}</dd>
				<dt>Timezone</dt><dd>{data.me.timezone ?? '—'}</dd>
			</dl>
		{:else}
			<p class="status">✗ {data.me.error}</p>
		{/if}
	</section>

	<section>
		<h2>Settings</h2>
		<dl>
			<dt>Monica</dt><dd>{data.settings.monicaUrl}</dd>
			<dt>Read-only</dt>
			<dd class:warn={!data.settings.readOnly}>{data.settings.readOnly ? 'on (writes refused)' : 'OFF (writes allowed)'}</dd>
			<dt>Dry run</dt><dd>{data.settings.dryRun ? 'on' : 'off'}</dd>
		</dl>
	</section>

	<section class:bad={!data.db.ok}>
		<h2>Extension DB</h2>
		{#if data.db.ok}
			<p class="status">✓ Open · {data.db.auditRows} audit log rows</p>
		{:else}
			<p class="status">✗ {data.db.error}</p>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: max(1rem, env(safe-area-inset-top)) 1rem 1rem;
	}
	h1 {
		font-size: 1.75rem;
		font-weight: 600;
		margin: 0.5rem 0 0;
	}
	section {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 1rem;
		margin-block: 1rem;
	}
	section.bad {
		border-color: var(--attention);
	}
	h2 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
	}
	dt {
		color: var(--muted);
		font-size: 0.875rem;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.status {
		margin: 0 0 0.5rem;
	}
	.warn {
		color: var(--attention);
		font-weight: 600;
	}
</style>
