<script lang="ts">
	import { page } from '$app/state';
	import Avatar from '#lib/components/Avatar.svelte';
	import { allTags, fold, searchContacts, sortContacts } from '#lib/contacts.js';
	import {
		activeMentions,
		checkHangout,
		checkJournal,
		checkPersonNotes,
		hangoutPayload,
		insertMention,
		journalPayload,
		mentionQuery,
		parsePeople,
		personNotePayloads,
		rankForMention,
		snapPunctuation,
		todayIso,
		type Mention
	} from '#lib/log.js';
	import { tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let kind = $state<'hangout' | 'journal'>(page.url.searchParams.get('kind') === 'journal' ? 'journal' : 'hangout');

	// ---- Hangout
	// Pre-fill once from ?people= (select mode, contact page); later edits are local.
	const people = new SvelteSet<number>(
		untrack(() => {
			const known = new Set(data.contacts.map((c) => c.id));
			return parsePeople(page.url.searchParams.get('people')).filter((id) => known.has(id));
		})
	);
	let summary = $state('');
	let description = $state('');
	let date = $state(todayIso());
	let typeId = $state<number | null>(null);
	let search = $state('');

	const tags = $derived(allTags(data.contacts));
	const picked = $derived(data.contacts.filter((c) => people.has(c.id)));
	// Suggestions: matches for the search, else most recently contacted people.
	// Kept short so the rest of the form stays in view: 4 recent people until someone is
	// picked, then only search results.
	const suggestions = $derived(
		search.trim()
			? searchContacts(data.contacts, search).filter((c) => !people.has(c.id)).slice(0, 6)
			: people.size
				? []
				: sortContacts(data.contacts, 'last-contacted').slice(0, 4)
	);
	function addTag(t: string) {
		for (const c of data.contacts) if (c.tags.includes(t)) people.add(c.id);
	}
	const typesByCategory = $derived(
		Object.entries(
			data.types.reduce<Record<string, typeof data.types>>((acc, t) => {
				(acc[t.category ?? 'Other'] ??= []).push(t);
				return acc;
			}, {})
		)
	);

	// Per-person notes: "what I learned about them", saved as a note on each person's page.
	let personNotes = $state<Record<number, string>>({});
	const openNotes = new SvelteSet<number>();
	function openNote(id: number) {
		openNotes.add(id);
		tick().then(() => document.getElementById(`note-${id}`)?.focus());
	}

	// ---- Journal
	let title = $state('');
	let post = $state('');
	let postEl = $state<HTMLTextAreaElement>();
	let picks = $state<Mention[]>([]);
	let mq = $state<{ query: string; start: number } | null>(null);
	let insertedAt: number | null = null; // caret right after the last inserted mention
	const mentions = $derived(activeMentions(post, picks));
	const mentionSuggestions = $derived(
		mq === null
			? []
			: (mq.query.trim() ? rankForMention(searchContacts(data.contacts, mq.query), mq.query, fold) : sortContacts(data.contacts, 'last-contacted')).slice(0, 5)
	);
	function trackMention() {
		mq = postEl ? mentionQuery(post, postEl.selectionStart) : null;
	}
	async function pickMention(c: (typeof data.contacts)[number]) {
		if (!postEl || !mq) return;
		const r = insertMention(post, mq.start, postEl.selectionStart, c.name);
		post = r.text;
		picks = [...picks, { contactId: c.id, name: c.name }];
		mq = null;
		insertedAt = r.caret;
		await tick();
		postEl.focus();
		postEl.setSelectionRange(r.caret, r.caret);
	}
	function mentionKeys(e: KeyboardEvent) {
		// Modifier keys (Shift for "!" or "?") don't end the chance to snap punctuation.
		if (postEl && !['Shift', 'Alt', 'Control', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) {
			const snap = snapPunctuation(post, postEl.selectionStart, e.key, insertedAt);
			insertedAt = null;
			if (snap) {
				e.preventDefault();
				post = snap.text;
				tick().then(() => postEl?.setSelectionRange(snap.caret, snap.caret));
				return;
			}
		}
		if (!mq || !mentionSuggestions.length) return;
		if (e.key === 'Enter' || e.key === 'Tab') {
			e.preventDefault();
			pickMention(mentionSuggestions[0]);
		} else if (e.key === 'Escape') {
			mq = null;
		}
	}

	// ---- Preview (slice 4 sends exactly this through the write guards)
	let showProblems = $state(false);
	const hangoutDraft = $derived({ contactIds: [...people], personNotes, summary, description, date, activityTypeId: typeId });
	const problems = $derived(
		kind === 'hangout' ? { ...checkHangout(hangoutDraft), ...checkPersonNotes(hangoutDraft) } : checkJournal({ title, post })
	);
	const ok = $derived(Object.keys(problems).length === 0);
	const nameOf = (id: number) => data.contacts.find((c) => c.id === id)?.name ?? `#${id}`;
	// Every request slice 4 would send, in order.
	const requests = $derived(
		kind === 'hangout'
			? [
					{ label: `One activity for ${picked.length} ${picked.length === 1 ? 'person' : 'people'}`, endpoint: '/api/activities', body: hangoutPayload(hangoutDraft) as object },
					...personNotePayloads(hangoutDraft).map((n) => ({ label: `Note on ${nameOf(n.contact_id)}’s page`, endpoint: '/api/notes', body: n as object }))
				]
			: [{ label: 'Journal entry', endpoint: '/api/journal', body: journalPayload({ title, post }) as object }]
	);
	let previewOpen = $state(false);

	const input = 'w-full min-w-0 rounded-[var(--radius-input)] border border-control bg-surface px-3 text-base';
	const label = 'mb-1 block text-sm font-medium';
	const err = 'mt-1 text-sm text-attention';
	const chip = 'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm whitespace-nowrap';
</script>

<svelte:head><title>Log · orbit</title></svelte:head>

<div class="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
	<div class="flex items-center justify-between pt-2">
		<h1 class="text-2xl font-semibold">Log</h1>
		<a href="/diary" class="inline-flex min-h-11 items-center px-2 text-accent">Cancel</a>
	</div>

	<div class="my-3 grid grid-cols-2 gap-1 rounded-[var(--radius-input)] border border-control p-1" role="tablist" aria-label="What to log">
		{#each [['hangout', 'Hangout'], ['journal', 'Journal entry']] as [k, text] (k)}
			<button
				type="button"
				role="tab"
				aria-selected={kind === k}
				class="min-h-10 rounded-md text-sm font-medium {kind === k ? 'bg-accent-solid text-on-accent' : 'text-fg'}"
				onclick={() => ((kind = k as typeof kind), (showProblems = false))}>{text}</button
			>
		{/each}
	</div>

	<form class="flex flex-col gap-5" onsubmit={(e) => { e.preventDefault(); showProblems = true; if (ok) previewOpen = true; }}>
		{#if kind === 'hangout'}
			<!-- People -->
			<!-- min-w-0: fieldsets default to min-width: min-content, so the chip scroller would widen the page -->
			<fieldset class="min-w-0">
				<legend class={label}>Who was there</legend>
				{#if picked.length}
					<ul class="mb-2 flex flex-wrap gap-2" aria-label="Selected people" data-testid="picked">
						{#each picked as c (c.id)}
							<li>
								<button type="button" class="{chip} border-accent-solid bg-accent-soft text-on-accent-soft" onclick={() => people.delete(c.id)} aria-label="Remove {c.name}">
									{c.name} <span aria-hidden="true">×</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<label class="sr-only" for="who">Find people</label>
				<input id="who" type="search" inputmode="search" autocomplete="off" placeholder={people.size ? 'Add someone else' : 'Search people'} bind:value={search} class="{input} h-11" />
				<ul class="mt-2 flex flex-col">
					{#each suggestions as c (c.id)}
						<li>
							<button type="button" class="flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-input)] px-1 text-left hover:bg-surface-2" onclick={() => (people.add(c.id), (search = ''))}>
								<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-8" text="text-xs" />
								<span class="flex-1">{c.name}</span>
								<span class="text-accent" aria-hidden="true">+</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if tags.length}
					<p class="mt-2 mb-1 text-sm text-muted">Add a whole group</p>
					<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
						{#each tags as t (t)}<button type="button" class="{chip} border-control bg-surface" onclick={() => addTag(t)}>+ {t}</button>{/each}
					</div>
				{/if}
				{#if showProblems && problems.people}<p class={err}>{problems.people}</p>{/if}
			</fieldset>

			{#if picked.length}
				<section aria-labelledby="about-each">
					<h2 id="about-each" class={label}>About each person <span class="font-normal text-muted">(optional)</span></h2>
					<p class="mb-2 text-sm text-muted">What you learned or want to remember. Saved as a note on their page.</p>
					<div class="flex flex-col gap-3">
						{#each picked as c (c.id)}
							{#if openNotes.has(c.id) || personNotes[c.id]}
								<div>
									<label for="note-{c.id}" class="mb-1 flex items-center gap-2 text-sm">
										<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-6" text="text-[10px]" />
										{c.name}
									</label>
									<textarea
										id="note-{c.id}"
										rows="2"
										class="{input} py-2"
										placeholder="e.g. Starting a new job in March"
										value={personNotes[c.id] ?? ''}
										oninput={(e) => (personNotes = { ...personNotes, [c.id]: e.currentTarget.value })}
									></textarea>
								</div>
							{/if}
						{/each}
					</div>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each picked.filter((c) => !openNotes.has(c.id) && !personNotes[c.id]) as c (c.id)}
							<button type="button" class="{chip} border-control bg-surface" onclick={() => openNote(c.id)}>+ Note on {c.name.split(' ')[0]}</button>
						{/each}
					</div>
					{#if showProblems && problems.notes}<p class={err}>{problems.notes}</p>{/if}
				</section>
			{/if}

			<div>
				<label class={label} for="summary">What did you do?</label>
				<input id="summary" class="{input} h-11" maxlength="255" placeholder="Dinner at Ana’s" bind:value={summary} />
				{#if showProblems && problems.summary}<p class={err}>{problems.summary}</p>{/if}
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="min-w-0">
					<label class={label} for="date">Date</label>
					<input id="date" type="date" class="{input} h-11" max={todayIso()} bind:value={date} />
					{#if showProblems && problems.date}<p class={err}>{problems.date}</p>{/if}
				</div>
				<div class="min-w-0">
					<label class={label} for="type">Type <span class="font-normal text-muted">(optional)</span></label>
					<select id="type" class="{input} h-11" bind:value={typeId}>
						<option value={null}>—</option>
						{#each typesByCategory as [cat, list] (cat)}
							<optgroup label={cat}>{#each list as t (t.id)}<option value={t.id}>{t.name}</option>{/each}</optgroup>
						{/each}
					</select>
				</div>
			</div>

			<div>
				<label class={label} for="desc">Notes <span class="font-normal text-muted">(optional)</span></label>
				<textarea id="desc" rows="3" class="{input} py-2" bind:value={description}></textarea>
			</div>
		{:else}
			<div>
				<label class={label} for="title">Title</label>
				<input id="title" class="{input} h-11" maxlength="255" placeholder="Weekend in Whistler" bind:value={title} />
				{#if showProblems && problems.title}<p class={err}>{problems.title}</p>{/if}
			</div>
			<div>
				<label class={label} for="post">Entry</label>
				<textarea
					id="post"
					rows="8"
					class="{input} py-2"
					placeholder="Type @ to mention someone"
					aria-describedby="mention-hint"
					aria-autocomplete="list"
					aria-controls="mention-list"
					bind:this={postEl}
					bind:value={post}
					oninput={trackMention}
					onclick={trackMention}
					onkeyup={(e) => { if (e.key.startsWith('Arrow')) trackMention(); }}
					onkeydown={mentionKeys}
					onblur={() => setTimeout(() => (mq = null), 150)}
				></textarea>
				{#if mentionSuggestions.length}
					<ul id="mention-list" role="listbox" aria-label="Mention someone" class="mt-1 overflow-hidden rounded-[var(--radius-input)] border border-control bg-surface shadow-md">
						{#each mentionSuggestions as c, i (c.id)}
							<li role="option" aria-selected={i === 0}>
								<button type="button" class="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-surface-2 {i === 0 ? 'bg-surface-2' : ''}" onmousedown={(e) => e.preventDefault()} onclick={() => pickMention(c)}>
									<Avatar id={c.id} name={c.name} initials={c.initials} color={c.color} hasPhoto={c.hasPhoto} size="size-7" text="text-xs" />
									{c.name}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<p id="mention-hint" class="mt-1 text-sm text-muted">Type @ and a name to mention someone; it links the entry to their page.</p>
				{#if mentions.length}
					<p class="mt-2 text-sm" data-testid="mentions">
						<span class="text-muted">Mentioned:</span>
						{#each mentions as m, i (m.contactId)}<a href="/contacts/{m.contactId}" class="text-accent">{m.name}</a>{i < mentions.length - 1 ? ', ' : ''}{/each}
					</p>
				{/if}
				{#if showProblems && problems.post}<p class={err}>{problems.post}</p>{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<button type="submit" class="min-h-12 rounded-[var(--radius-input)] border border-accent-solid font-medium text-accent">Preview</button>
			<button type="button" disabled class="min-h-12 rounded-[var(--radius-input)] bg-surface-2 font-medium text-muted" title="Arrives with writes (slice 4)">Save</button>
			<p class="text-center text-sm text-muted">Saving arrives with writes (slice 4). Preview shows exactly what will be sent.</p>
		</div>
	</form>
</div>

{#if previewOpen}
	<div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Preview">
		<div class="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[var(--radius-card)] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-card)]">
			<h2 class="text-lg font-semibold">This would be sent to Monica</h2>
			<p class="mt-1 text-sm text-muted">{requests.length} {requests.length === 1 ? 'request' : 'requests'}, in this order. The activity appears on each person’s timeline.</p>
			<ol class="mt-3 flex flex-col gap-3" data-testid="preview">
				{#each requests as r, i (i)}
					<li>
						<p class="mb-1 text-sm font-medium">{i + 1}. {r.label}</p>
						<pre class="overflow-x-auto rounded-[var(--radius-input)] bg-surface-2 p-3 text-sm whitespace-pre-wrap break-words">POST {r.endpoint}
{JSON.stringify(r.body, null, 2)}</pre>
					</li>
				{/each}
			</ol>
			{#if kind === 'journal' && mentions.length}
				<p class="mt-3 text-sm">Then orbit links the entry to {mentions.map((m) => m.name).join(', ')} in its own database (nothing extra in Monica).</p>
			{/if}
			<p class="mt-2 text-sm text-muted">Nothing has been sent.</p>
			<button type="button" class="mt-3 min-h-12 w-full rounded-[var(--radius-input)] bg-accent-solid font-medium text-on-accent" onclick={() => (previewOpen = false)}>Back to editing</button>
		</div>
	</div>
{/if}
