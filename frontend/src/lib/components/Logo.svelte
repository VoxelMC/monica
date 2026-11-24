<script lang="ts">
	// orbit's mark (2026-11-24, concept B2): the "o" with a satellite breaking out of it.
	// Ring in the text colour, satellite in the theme's accent, so it follows every theme.
	let { size = 28, label = true }: { size?: number; label?: boolean } = $props();
</script>

<span class="inline-flex items-center gap-2">
	<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="shrink-0">
		<path d="M53.60 27.80 A22 22 0 1 1 33.53 10.05" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" />
		<circle cx="49.23" cy="12.53" r="6.5" fill="var(--accent)" />
	</svg>
	{#if label}<span>orbit</span>{/if}
</span>
