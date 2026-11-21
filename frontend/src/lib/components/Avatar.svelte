<script lang="ts">
	interface Props {
		id: number;
		name: string;
		initials: string;
		color: string;
		hasPhoto: boolean;
		size?: string;
		text?: string;
	}
	let { id, name, initials, color, hasPhoto, size = 'size-12', text = 'text-sm' }: Props = $props();
	let failed = $state(false);

	// Dark initials on light colours, white on dark ones (WCAG relative luminance).
	function textColor(hex: string): string {
		const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
		if (!m) return '#fff';
		const [r, g, b] = m.slice(1).map((h) => {
			const c = parseInt(h, 16) / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
		return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#0f172a' : '#fff';
	}
</script>

{#if hasPhoto && !failed}
	<img
		src="/avatars/{id}"
		alt=""
		loading="lazy"
		decoding="async"
		width="80"
		height="80"
		class="{size} shrink-0 rounded-full bg-slate-200 object-cover dark:bg-slate-800"
		onerror={() => (failed = true)}
	/>
{:else}
	<span
		class="{size} {text} flex shrink-0 items-center justify-center rounded-full font-semibold"
		style:background-color={color}
		style:color={textColor(color)}
		aria-hidden="true"
		title={name}
	>
		{initials}
	</span>
{/if}
