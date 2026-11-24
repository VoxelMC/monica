<script lang="ts">
	// "Catch up every…" on a contact page: orbit's own target (orbit's database), with
	// Monica's "stay in touch" shown as the fallback when there is none.
	import { enhance } from '$app/forms';

	interface Props {
		days: number | null;
		source: 'orbit' | 'monica' | null;
		lastContacted: string | null;
		ondone: (r: { ok: boolean; message: string; audit?: boolean }) => void;
	}
	let { days, source, lastContacted, ondone }: Props = $props();
	const PRESETS: [number, string][] = [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [60, '2 months'], [90, '3 months'], [180, '6 months'], [365, '1 year']];
	let open = $state(false);
	let choice = $state('');
	let custom = $state('');
	let busy = $state(false);
	const value = $derived(choice === 'custom' ? custom : choice);

	const since = $derived(lastContacted ? Math.floor((Date.now() - Date.parse(lastContacted)) / 86_400_000) : null);
	const status = $derived.by(() => {
		if (!days) return null;
		if (since === null) return { text: 'nothing logged yet', late: true };
		const left = days - since;
		return left < 0 ? { text: `${-left} days overdue`, late: true } : left === 0 ? { text: 'due today', late: true } : { text: `due in ${left} days`, late: false };
	});
	const label = (d: number) => PRESETS.find(([n]) => n === d)?.[1] ?? `${d} days`;

	function show() {
		choice = days ? (PRESETS.some(([n]) => n === days) ? String(days) : 'custom') : '21';
		custom = days ? String(days) : '';
		open = true;
	}
</script>

<div class="text-sm" data-testid="catchup">
	{#if days}
		<span class="text-muted">Catch up every</span> {label(days)}{#if source === 'monica'}<span class="text-muted"> (from Monica)</span>{/if}
		{#if status}<span class={status.late ? 'font-medium text-attention' : 'text-muted'}> · {status.text}</span>{/if}
		<span class="text-muted"> · </span><button type="button" class="text-accent hover:underline" onclick={show} data-testid="catchup-edit">{source === 'monica' ? 'Set in orbit' : 'Change'}</button>
	{:else}
		<button type="button" class="text-accent hover:underline" onclick={show} data-testid="catchup-edit">+ Catch up every…</button>
	{/if}

	{#if open}
		<form
			method="POST"
			action="?/catchup"
			class="mt-2 flex flex-wrap items-end gap-2"
			use:enhance={() => {
				busy = true;
				return async ({ result, update }) => {
					busy = false;
					const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
					ondone({ ...(d ?? { ok: false, message: 'Something went wrong.' }), audit: false });
					if (d?.ok) open = false;
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="days" value={value} />
			<label class="block">
				<span class="text-xs text-muted">Every</span>
				<select bind:value={choice} class="mt-1 block min-h-11 rounded-[var(--radius-input)] border border-line bg-surface px-2" data-testid="catchup-choice">
					{#each PRESETS as [n, l] (n)}<option value={String(n)}>{l}</option>{/each}
					<option value="custom">Other…</option>
				</select>
			</label>
			{#if choice === 'custom'}
				<label class="block"><span class="text-xs text-muted">Days</span><input bind:value={custom} inputmode="numeric" maxlength="4" class="mt-1 block min-h-11 w-20 rounded-[var(--radius-input)] border border-line bg-surface px-2" /></label>
			{/if}
			<button disabled={busy || !value} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40" data-testid="catchup-save">Save</button>
			{#if source === 'orbit'}
				<button disabled={busy} name="clear" value="1" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" data-testid="catchup-clear">Clear</button>
			{/if}
			<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-3 text-muted hover:bg-surface-2" onclick={() => (open = false)}>Cancel</button>
		</form>
		{#if source === 'monica'}<p class="mt-1 text-xs text-muted">orbit’s target takes over from Monica’s “stay in touch” in orbit; Monica’s own setting is left as it is.</p>{/if}
	{/if}
</div>
