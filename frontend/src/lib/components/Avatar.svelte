<script lang="ts">
	interface Props {
		id: number;
		name: string;
		initials: string;
		color: string;
		hasPhoto: boolean;
		/** Changes with the photo, so a new photo is not hidden by the browser cache. */
		photoKey?: string | null;
		size?: string;
		text?: string;
	}
	let { id, name, initials, color, hasPhoto, photoKey = null, size = 'size-12', text = 'text-sm' }: Props = $props();
	let failed = $state(false);
	// Same corner radius as cards and buttons; big photos get a slightly larger one.
	const radius = $derived(/size-(1[6-9]|[2-9]\d)\b/.test(size) ? 'rounded-[var(--radius-photo-lg)]' : 'rounded-[var(--radius-photo)]');

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
		src={photoKey ? `/avatars/${id}?v=${encodeURIComponent(photoKey)}` : `/avatars/${id}`}
		alt=""
		loading="lazy"
		decoding="async"
		width="80"
		height="80"
		class="{size} {radius} shrink-0 bg-surface-2 object-cover"
		onerror={() => (failed = true)}
	/>
{:else}
	<span
		class="{size} {text} {radius} flex shrink-0 items-center justify-center font-semibold"
		style:background-color={color}
		style:color={textColor(color)}
		aria-hidden="true"
		title={name}
	>
		{initials}
	</span>
{/if}
