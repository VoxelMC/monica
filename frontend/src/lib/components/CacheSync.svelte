<script lang="ts">
	// Pages show orbit's cached copy of Monica at once. If that copy was old, the
	// server is already asking Monica again in the background; after every page
	// load this asks /fresh whether that brought anything new and, if so, reloads
	// the page data (quick: it comes from the now fresh cache). A small pill shows
	// while it waits. Coming back to the app after a while does the same.
	import { afterNavigate, refreshAll } from '$app/navigation';
	import { onMount, untrack } from 'svelte';

	let { serverNow }: { serverNow: number } = $props();

	let since = untrack(() => serverNow);
	let state = $state<'idle' | 'checking' | 'updated'>('idle');
	let running = false;
	let again = false;
	let hiddenAt = 0;
	let doneTimer: ReturnType<typeof setTimeout> | undefined;

	async function check() {
		if (running) {
			again = true;
			return;
		}
		running = true;
		// Only show the pill if the answer is not immediate (nothing was re-checking)
		const show = setTimeout(() => (state = 'checking'), 250);
		try {
			do {
				again = false;
				const res = await fetch(`/fresh?since=${since}`);
				if (!res.ok) break;
				const r = (await res.json()) as { now: number; busy: boolean; changed: boolean };
				since = r.now;
				if (r.changed) {
					state = 'checking';
					await refreshAll();
					clearTimeout(doneTimer);
					state = 'updated';
					doneTimer = setTimeout(() => (state = 'idle'), 1500);
				}
			} while (again);
		} catch {
			// offline or server restarting: the page keeps what it has
		} finally {
			clearTimeout(show);
			running = false;
			if (state === 'checking') state = 'idle';
		}
	}

	afterNavigate(() => void check());

	onMount(() => {
		const onVis = async () => {
			if (document.visibilityState === 'hidden') {
				hiddenAt = Date.now();
				return;
			}
			// Back after a minute or more: rebuild the page (from the cache, so it is
			// instant), which starts the re-checks, then see what they bring.
			if (hiddenAt && Date.now() - hiddenAt > 60_000) {
				hiddenAt = 0;
				await refreshAll().catch(() => {});
				void check();
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	});
</script>

{#if state !== 'idle'}
	<div
		class="pointer-events-none fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted shadow-sm lg:top-3 lg:bottom-auto"
		role="status"
		data-testid="cache-sync"
	>
		{#if state === 'checking'}
			<svg viewBox="0 0 24 24" class="size-3.5 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
			Checking Monica…
		{:else}
			<svg viewBox="0 0 24 24" class="size-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
			Updated
		{/if}
	</div>
{/if}
