<script lang="ts">
	import { useTagPaint } from '#lib/tag-colours.js';

	interface Props {
		name: string;
		/** Link to the People list filtered by this tag. */
		href?: string;
		size?: 'sm' | 'md';
	}
	let { name, href, size = 'sm' }: Props = $props();
	const tagPaint = useTagPaint();
	const paint = $derived(tagPaint(name));
	const cls = $derived(
		`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] whitespace-nowrap ${size === 'sm' ? 'px-1.5 py-px text-xs' : 'min-h-8 px-2.5 text-sm'}`
	);
</script>

<!-- Each tag keeps its own colour (picked on the Tags page, or automatic from the theme's six), so tags are easy to tell apart. -->
{#if href}
	<a {href} class={cls} style:background-color={paint.bg} style:color={paint.fg}>
		<span class="size-1.5 rounded-[1px]" style:background-color={paint.dot} aria-hidden="true"></span>{name}
	</a>
{:else}
	<span class={cls} style:background-color={paint.bg} style:color={paint.fg}>
		<span class="size-1.5 rounded-[1px]" style:background-color={paint.dot} aria-hidden="true"></span>{name}
	</span>
{/if}
