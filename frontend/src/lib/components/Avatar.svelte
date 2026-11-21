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
		class="{size} {text} flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
		style:background-color={color}
		aria-hidden="true"
		title={name}
	>
		{initials}
	</span>
{/if}
