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
		padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
		font: 16px/1.5 system-ui, sans-serif;
		color: #1f2933;
	}
	section {
		border: 1px solid #d9dee3;
		border-radius: 12px;
		padding: 1rem;
		margin-block: 1rem;
	}
	section.bad {
		border-color: #c53030;
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
	}
	dt {
		color: #52606d;
		font-size: 14px;
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.status {
		margin: 0 0 0.5rem;
	}
	.warn {
		color: #c53030;
		font-weight: 600;
	}
	@media (prefers-color-scheme: dark) {
		main { color: #e4e7eb; }
		section { border-color: #3e4c59; }
		dt { color: #9aa5b1; }
		.warn, section.bad { color: #fc8181; border-color: #fc8181; }
	}
	:global(body) { margin: 0; }
	@media (prefers-color-scheme: dark) {
		:global(body) { background: #121619; }
	}
</style>
