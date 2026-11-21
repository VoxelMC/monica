<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Only live sections are links; the rest arrive in later slices.
	const tabs = [
		{ href: '/contacts', label: 'People', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m13 9v-1a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75' },
		{ href: '/diary', label: 'Diary', icon: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20M8 7h8M8 11h6' },
		{ href: '/tags', label: 'Tags', icon: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4zM7.5 7.5h.01' },
		{ href: '/health', label: 'Health', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' }
	];
	// Phone bar: the Log button sits in the middle, within thumb reach.
	const left = $derived(tabs.slice(0, 2));
	const right = $derived(tabs.slice(2));
	const active = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0d9488" />
</svelte:head>

<div class="lg:flex">
	<!-- Desktop sidebar -->
	<nav class="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line p-4 lg:flex" aria-label="Main">
		<a href="/contacts" class="mb-4 px-3 text-lg font-semibold text-accent">orbit</a>
		<a href="/log" class="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-input)] bg-accent-solid px-3 font-medium text-on-accent">
			<span aria-hidden="true" class="text-lg leading-none">+</span> Log
		</a>
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				aria-current={active(t.href) ? 'page' : undefined}
				class="flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-muted hover:bg-surface-2 aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
			>
				<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
				{t.label}
			</a>
		{/each}
	</nav>

	<div class="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
		{@render children()}
	</div>
</div>

<!-- Phone bottom tab bar -->
{#snippet tab(t: (typeof tabs)[number])}
	<a
		href={t.href}
		aria-current={active(t.href) ? 'page' : undefined}
		class="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted aria-[current=page]:text-accent"
	>
		<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
		{t.label}
	</a>
{/snippet}
<nav class="fixed inset-x-0 bottom-0 z-20 flex items-center border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
	{#each left as t (t.href)}{@render tab(t)}{/each}
	<div class="flex flex-1 justify-center">
		<a
			href="/log"
			aria-label="Log a hangout or journal entry"
			aria-current={active('/log') ? 'page' : undefined}
			class="flex size-12 items-center justify-center rounded-full bg-accent-solid text-on-accent shadow-md"
		>
			<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
		</a>
	</div>
	{#each right as t (t.href)}{@render tab(t)}{/each}
</nav>
