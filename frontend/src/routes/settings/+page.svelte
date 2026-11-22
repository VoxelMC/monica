<script lang="ts">
	import { FONTS, savePrefs, type FontId, type PeopleView, type Prefs, type ThemeMode } from '#lib/prefs.js';
	import { DARK_THEMES, LIGHT_THEMES, type Theme } from '#lib/themes.js';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let prefs = $state<Prefs>(untrack(() => ({ ...data.prefs })));

	function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
		prefs = { ...prefs, [key]: value };
		savePrefs(prefs); // applies at once and remembers it on this device
	}
	// Picking a light (or dark) theme while in the other mode switches the mode,
	// so the choice is visible right away.
	function pickTheme(t: Theme) {
		const next: Prefs = { ...prefs, [t.mode]: t.id };
		if (prefs.mode !== 'system' && prefs.mode !== t.mode) next.mode = t.mode;
		prefs = next;
		savePrefs(prefs);
	}
	const cardVars = (t: Theme) => Object.entries(t.tokens).map(([k, v]) => `--${k}:${v}`).join(';');
	const seg = 'flex-1 min-h-9 rounded-[var(--radius-chip)] text-sm';
</script>

<svelte:head><title>Settings · orbit</title></svelte:head>

{#snippet themeCard(t: Theme, chosen: boolean)}
	<li>
		<button
			type="button"
			aria-pressed={chosen}
			style={cardVars(t)}
			class="w-full overflow-hidden rounded-[var(--radius-card)] border text-left {chosen ? 'border-accent-solid ring-2 ring-accent-solid' : 'border-line'}"
			onclick={() => pickTheme(t)}
		>
			<!-- A small preview drawn in the theme's own colours -->
			<span class="block bg-[var(--bg)] p-2.5">
				<span class="flex items-center gap-2 rounded-[4px] border border-[var(--line)] bg-[var(--surface)] p-2">
					<span class="size-6 rounded-[3px] bg-[var(--hue-2)]"></span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-xs font-semibold text-[var(--fg)]">Ana Bernaz</span>
						<span class="block truncate text-[0.65rem] text-[var(--muted)]">Last contact 3 days ago</span>
					</span>
					<span class="rounded-[2px] bg-[var(--tag-1-bg)] px-1 text-[0.6rem] text-[var(--tag-1-fg)]">Paris</span>
				</span>
				<span class="mt-1.5 flex gap-1">
					{#each [1, 2, 3, 4, 5, 6] as i (i)}<span class="h-1.5 flex-1 rounded-[1px]" style:background-color="var(--hue-{i})"></span>{/each}
				</span>
			</span>
			<span class="flex items-center justify-between gap-2 bg-surface px-2.5 py-1.5 text-sm text-fg">
				<span class="truncate">{t.name}</span>
				{#if chosen}<span class="shrink-0 text-xs text-accent" aria-label="In use">✓</span>{/if}
			</span>
		</button>
	</li>
{/snippet}

<div class="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 lg:px-8">
	<h1 class="pt-2 pb-1 text-2xl font-semibold">Settings</h1>
	<p class="mb-6 text-sm text-muted">Saved on this device. Nothing here changes your Monica data.</p>

	<section class="mb-8" aria-labelledby="mode-h">
		<h2 id="mode-h" class="mb-2 text-lg font-semibold">Appearance</h2>
		<div class="flex max-w-sm gap-0.5 rounded-[var(--radius-input)] border border-control p-0.5" role="radiogroup" aria-label="Mode">
			{#each [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']] as [m, label] (m)}
				<button type="button" role="radio" aria-checked={prefs.mode === m} class="{seg} {prefs.mode === m ? 'bg-accent-solid text-on-accent' : 'text-fg hover:bg-surface-2'}" onclick={() => set('mode', m as ThemeMode)}>{label}</button>
			{/each}
		</div>
	</section>

	<section class="mb-8" aria-labelledby="light-h">
		<h2 id="light-h" class="mb-1 text-lg font-semibold">Light theme</h2>
		<p class="mb-3 text-sm text-muted">Used in light mode{prefs.mode === 'system' ? ' and when your device is light' : ''}.</p>
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="light-themes">
			{#each LIGHT_THEMES as t (t.id)}{@render themeCard(t, prefs.light === t.id)}{/each}
		</ul>
	</section>

	<section class="mb-8" aria-labelledby="dark-h">
		<h2 id="dark-h" class="mb-1 text-lg font-semibold">Dark theme</h2>
		<p class="mb-3 text-sm text-muted">Used in dark mode{prefs.mode === 'system' ? ' and when your device is dark' : ''}.</p>
		<ul class="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dark-themes">
			{#each DARK_THEMES as t (t.id)}{@render themeCard(t, prefs.dark === t.id)}{/each}
		</ul>
	</section>

	<section class="mb-8" aria-labelledby="font-h">
		<h2 id="font-h" class="mb-3 text-lg font-semibold">Font</h2>
		<ul class="flex flex-col gap-2" role="radiogroup" aria-label="Font">
			{#each FONTS as f (f.id)}
				<li>
					<button
						type="button"
						role="radio"
						aria-checked={prefs.font === f.id}
						class="flex w-full items-baseline justify-between gap-4 rounded-[var(--radius-card)] border px-3 py-2.5 text-left {prefs.font === f.id ? 'border-accent-solid ring-1 ring-accent-solid' : 'border-line hover:border-control'}"
						onclick={() => set('font', f.id as FontId)}
					>
						<span style:font-family={f.stack}>
							<span class="block text-lg font-semibold">{f.name}</span>
							<span class="block text-sm text-muted">Dinner at Ana’s, 21 November · 12 people</span>
						</span>
						{#if prefs.font === f.id}<span class="text-xs text-accent">✓ In use</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="mb-8" aria-labelledby="people-h">
		<h2 id="people-h" class="mb-2 text-lg font-semibold">People list</h2>
		<div class="flex max-w-xs gap-0.5 rounded-[var(--radius-input)] border border-control p-0.5" role="radiogroup" aria-label="People list">
			{#each [['cards', 'Cards'], ['lines', 'Lines']] as [v, label] (v)}
				<button type="button" role="radio" aria-checked={prefs.peopleView === v} class="{seg} {prefs.peopleView === v ? 'bg-accent-solid text-on-accent' : 'text-fg hover:bg-surface-2'}" onclick={() => set('peopleView', v as PeopleView)}>{label}</button>
			{/each}
		</div>
	</section>

	<p class="text-sm text-muted"><a href="/health" class="underline underline-offset-2">System health</a></p>
</div>
