<script lang="ts">
	interface Props {
		id: number;
		name: string;
		initials: string;
		color: string;
		hasPhoto: boolean;
		size?: string;
	}
	let { id, name, initials, color, hasPhoto, size = 'size-12' }: Props = $props();
	let failed = $state(false);
</script>

{#if hasPhoto && !failed}
	<img
		src="/avatars/{id}"
		alt=""
		loading="lazy"
		decoding="async"
		width="48"
		height="48"
		class="{size} shrink-0 rounded-full bg-slate-200 object-cover dark:bg-slate-800"
		onerror={() => (failed = true)}
	/>
{:else}
	<span
		class="{size} flex shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
		style:background-color={color}
		aria-hidden="true"
		title={name}
	>
		{initials}
	</span>
{/if}
