<script lang="ts">
	// Reload this page with fresh data from Monica (skips orbit's 2-minute cache).
	import { refreshAll } from '$app/navigation';
	let { compact = false }: { compact?: boolean } = $props();
	let busy = $state(false);
	async function go() {
		busy = true;
		try {
			await fetch('/refresh', { method: 'POST' });
			await refreshAll();
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	onclick={go}
	disabled={busy}
	title="Refresh from Monica"
	aria-label="Refresh from Monica"
	class="inline-flex {compact ? 'size-9' : 'min-h-11 min-w-11'} items-center justify-center rounded-[var(--radius-input)] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-60"
	data-testid="refresh"
>
	<svg viewBox="0 0 24 24" class="size-5 {busy ? 'animate-spin' : ''}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
</button>
