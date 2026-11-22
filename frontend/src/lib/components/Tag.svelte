<script lang="ts">
	import { tagHue } from '#lib/themes.js';

	interface Props {
		name: string;
		/** Link to the People list filtered by this tag. */
		href?: string;
		size?: 'sm' | 'md';
	}
	let { name, href, size = 'sm' }: Props = $props();
	const hue = $derived(tagHue(name));
	const cls = $derived(
		`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] whitespace-nowrap ${size === 'sm' ? 'px-1.5 py-px text-xs' : 'min-h-8 px-2.5 text-sm'}`
	);
</script>

<!-- Each tag keeps its own colour (one of six from the theme), so tags are easy to tell apart. -->
{#if href}
	<a {href} class={cls} style:background-color="var(--tag-{hue}-bg)" style:color="var(--tag-{hue}-fg)">
		<span class="size-1.5 rounded-[1px]" style:background-color="var(--hue-{hue})" aria-hidden="true"></span>{name}
	</a>
{:else}
	<span class={cls} style:background-color="var(--tag-{hue}-bg)" style:color="var(--tag-{hue}-fg)">
		<span class="size-1.5 rounded-[1px]" style:background-color="var(--hue-{hue})" aria-hidden="true"></span>{name}
	</span>
{/if}
