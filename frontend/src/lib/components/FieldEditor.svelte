<script lang="ts">
	// Phones and emails on a contact page: a pencil to correct one, and "+ Phone" /
	// "+ Email" to add. Saved to Monica (contactfield.create / .update); phones get
	// the change on their next sync. Removing one is not possible from orbit.
	import { enhance } from '$app/forms';
	import { checkField, type FieldKind } from '#lib/contact-fields.js';
	import type { ContactFieldView } from '#lib/contact.js';

	interface Props {
		phones: ContactFieldView[];
		emails: ContactFieldView[];
		ondone: (result: { ok: boolean; message: string }) => void;
	}
	let { phones, emails, ondone }: Props = $props();

	let editing = $state<number | null>(null); // field id
	let adding = $state<FieldKind | null>(null);
	let value = $state('');
	let busy = $state(false);
	let box = $state<HTMLInputElement>();
	const editKind = $derived(editing !== null ? ([...phones, ...emails].find((f) => f.id === editing)?.kind ?? 'phone') : (adding ?? 'phone'));
	const problem = $derived(value.trim() ? ('error' in checkField(editKind as FieldKind, value) ? (checkField(editKind as FieldKind, value) as { error: string }).error : null) : null);

	function startEdit(f: ContactFieldView) {
		editing = f.id ?? null;
		adding = null;
		value = f.value;
		queueMicrotask(() => box?.focus());
	}
	function startAdd(k: FieldKind) {
		adding = k;
		editing = null;
		value = '';
		queueMicrotask(() => box?.focus());
	}
	function close() {
		editing = null;
		adding = null;
	}
	const submit = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string; data?: unknown }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			busy = false;
			const d = (result.type === 'success' || result.type === 'failure' ? result.data : null) as { ok: boolean; message: string } | null;
			ondone(d ?? { ok: false, message: 'Something went wrong; it may not have been saved. Check the audit log.' });
			if (d?.ok) close();
			await update({ reset: false });
		};
	};
	const inputCls = 'min-h-11 min-w-0 flex-1 rounded-[var(--radius-input)] border border-line bg-surface px-3';
</script>

{#snippet editor(action: string, hidden: Record<string, string | number>, kind: FieldKind)}
	<form method="POST" {action} use:enhance={submit} class="py-1" data-testid="field-form">
		{#each Object.entries(hidden) as [k, v] (k)}<input type="hidden" name={k} value={v} />{/each}
		<div class="flex gap-2">
			<input
				bind:this={box}
				bind:value
				name="value"
				type={kind === 'email' ? 'email' : 'tel'}
				inputmode={kind === 'email' ? 'email' : 'tel'}
				autocomplete="off"
				maxlength="255"
				aria-label={kind === 'email' ? 'Email address' : 'Phone number'}
				class={inputCls}
				onkeydown={(e) => e.key === 'Escape' && close()}
				data-testid="field-value"
			/>
			<button disabled={busy || !value.trim() || !!problem} class="min-h-11 rounded-[var(--radius-input)] bg-accent-solid px-4 font-semibold text-on-accent disabled:opacity-40" data-testid="field-save">{busy ? 'Saving…' : 'Save'}</button>
			<button type="button" class="min-h-11 rounded-[var(--radius-input)] px-2 text-muted hover:bg-surface-2" onclick={close}>Cancel</button>
		</div>
		{#if problem}<p class="mt-1 text-xs text-attention" role="alert">{problem}</p>{/if}
	</form>
{/snippet}

<ul class="flex flex-col gap-1">
	{#each [...phones, ...emails] as f, i (f.id ?? i)}
		{#if f.id !== undefined && editing === f.id && f.kind}
			<li>
				<span class="text-xs text-muted">{f.label}</span>
				{@render editor('?/fieldEdit', { fieldId: f.id, updatedAt: f.updatedAt ?? '' }, f.kind)}
			</li>
		{:else}
			<li class="group flex items-center gap-1">
				{#if f.href}
					<a href={f.href} class="-mx-2 flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-[var(--radius-input)] px-2 hover:bg-surface-2">
						<span class="text-xs text-muted">{f.label}</span>
						<span class="break-all text-accent">{f.value}</span>
					</a>
				{:else}
					<div class="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
						<span class="text-xs text-muted">{f.label}</span>
						<span class="break-all">{f.value}</span>
					</div>
				{/if}
				{#if f.kind && f.id !== undefined && f.updatedAt}
					<button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-input)] text-muted hover:bg-surface-2 hover:text-fg" aria-label="Edit {f.label.toLowerCase()} {f.value}" onclick={() => startEdit(f)} data-testid="field-edit">
						<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
					</button>
				{/if}
			</li>
		{/if}
	{/each}
</ul>
{#if adding}
	<div class="mt-1">
		<span class="text-xs text-muted">New {adding}</span>
		{@render editor('?/fieldAdd', { kind: adding }, adding)}
	</div>
{:else}
	<div class="mt-1 flex gap-3 text-sm">
		<button type="button" class="text-accent hover:underline" onclick={() => startAdd('phone')} data-testid="add-phone">+ Phone</button>
		<button type="button" class="text-accent hover:underline" onclick={() => startAdd('email')} data-testid="add-email">+ Email</button>
	</div>
{/if}
