<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · orbit</title></svelte:head>

<div class="mx-auto max-w-md px-4 py-16 text-center">
	<p class="text-5xl font-semibold text-slate-300 dark:text-slate-700">{page.status}</p>
	<h1 class="mt-2 text-lg font-medium">{page.status === 404 ? 'Not found' : 'Something went wrong'}</h1>
	<p class="mt-1 text-slate-500 dark:text-slate-400">{page.error?.message}</p>
	<a href="/contacts" class="mt-6 inline-flex min-h-11 items-center rounded-[var(--radius-input)] bg-accent-600 px-4 text-white">Back to People</a>
</div>
