<script lang="ts">
	// Correct a birthday that is already in Monica. Shows the current date next to
	// the new one; Monica replaces the birthday (and remakes its yearly reminder if
	// there is one). The server checks again and refuses if the contact changed.
	import { enhance } from '$app/forms';
	import { checkBirthday, daysInMonth } from '#lib/birthday-write.js';

	interface Props {
		current: { month: number; day: number; year: number | null };
		currentLabel: string;
		updatedAt: string;
		name: string;
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { current, currentLabel, updatedAt, name, ondone }: Props = $props();

	const MONTHS = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))));
	let open = $state(false);
	let month = $state(1);
	let day = $state(1);
	let year = $state('');
	let busy = $state(false);
	const yearNum = $derived(year.trim() ? Number(year) : null);
	const problem = $derived(checkBirthday({ month, day, year: yearNum }));
	const same = $derived(month === current.month && day === current.day && yearNum === current.year);
	const newLabel = $derived(`${MONTHS[month - 1]} ${day}${yearNum ? `, ${yearNum}` : ''}`);

	function show() {
		month = current.month;
		day = current.day;
		year = current.year ? String(current.year) : '';
		open = true;
	}
</script>

<button type="button" class="text-accent hover:underline" onclick={show} data-testid="edit-birthday">Edit</button>

{#if open}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="bday-title">
		<div class="w-full max-w-md rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-fg sm:rounded-[var(--radius-card)]">
			<h2 id="bday-title" class="text-lg font-semibold">Correct {name}’s birthday</h2>
			<form
				method="POST"
				action="?/birthday"
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						busy = false;
						const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
						ondone(d ?? { ok: false, message: 'Something went wrong; the birthday may not have changed. Check the audit log.' });
						open = false;
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="updatedAt" value={updatedAt} />
				<div class="mt-3 grid grid-cols-[1fr_5rem_6rem] gap-2">
					<label class="text-sm">
						<span class="text-muted">Month</span>
						<select name="month" bind:value={month} class="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-2">
							{#each MONTHS as m, i (m)}<option value={i + 1}>{m}</option>{/each}
						</select>
					</label>
					<label class="text-sm">
						<span class="text-muted">Day</span>
						<input name="day" type="number" inputmode="numeric" min="1" max={daysInMonth(month, yearNum)} bind:value={day} class="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-2" data-testid="bday-day" />
					</label>
					<label class="text-sm">
						<span class="text-muted">Year</span>
						<input name="year" inputmode="numeric" maxlength="4" placeholder="unknown" bind:value={year} class="mt-1 block min-h-11 w-full rounded-[var(--radius-input)] border border-line bg-surface px-2" data-testid="bday-year" />
					</label>
				</div>
				<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 rounded-[var(--radius-input)] border border-line bg-surface-2 p-3 text-sm" data-testid="bday-compare">
					<dt class="text-muted">Now</dt>
					<dd class="line-through decoration-1">{currentLabel}</dd>
					<dt class="text-muted">New</dt>
					<dd class="font-medium">{problem ? '—' : newLabel}</dd>
				</dl>
				{#if problem}<p class="mt-2 text-sm text-attention" role="alert">{problem}</p>{/if}
				<p class="mt-2 text-sm text-muted">This replaces the birthday in Monica (and on your phone after it syncs). Its yearly reminder moves to the new date.</p>
				<div class="mt-4 flex gap-2">
					<button type="button" onclick={() => (open = false)} class="min-h-11 flex-1 rounded-[var(--radius-input)] border border-line font-medium hover:bg-surface-2">Cancel</button>
					<button type="submit" disabled={busy || !!problem || same} class="min-h-11 flex-1 rounded-[var(--radius-input)] bg-accent-solid font-semibold text-on-accent disabled:opacity-40" data-testid="bday-save">
						{busy ? 'Saving…' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
