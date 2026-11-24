// Bulk tags (2026-11-23): add or remove one tag on many people, one guarded request
// per person, in order; people who already have it (or don't) are skipped, so
// nothing is sent needlessly. Stops at the first failure and reports progress.
import { z } from 'zod';
import type { ContactCard } from '../contacts';
import { ConflictError, MonicaError, WriteRefusedError } from './monica/errors';
import type { Guards } from './monica/guards';

const input = z.object({
	mode: z.enum(['add', 'remove']),
	contactIds: z.array(z.number().int().positive()).min(1).max(500),
	tag: z.string().max(255)
});

export interface TagSaveResult {
	ok: boolean;
	message: string;
	done: number[];
	skipped: number;
	dryRun: boolean;
}

export async function saveTags(guards: Guards, raw: unknown, contacts: ContactCard[], tags: { id: number; name: string }[]): Promise<TagSaveResult> {
	const fail = (message: string): TagSaveResult => ({ ok: false, message, done: [], skipped: 0, dryRun: false });
	const parsed = input.safeParse(raw);
	if (!parsed.success) return fail('The form could not be read. Reload the page and try again.');
	const { mode, contactIds } = parsed.data;
	const name = parsed.data.tag.trim();
	if (!name) return fail('Pick or type a tag.');
	const byId = new Map(contacts.map((c) => [c.id, c]));
	if (contactIds.some((id) => !byId.has(id))) return fail('One of the people is not in Monica any more. Reload and try again.');

	const sameName = (a: string) => a.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0;
	const existing = tags.find((t) => sameName(t.name));
	if (mode === 'remove' && !existing) return fail(`There is no tag called “${name}” in Monica.`);
	// Use Monica's spelling when the tag exists, so "paris" doesn't create a second "Paris"
	const tagName = existing?.name ?? name;

	const todo = [...new Set(contactIds)].filter((id) => {
		const has = byId.get(id)!.tags.some(sameName);
		return mode === 'add' ? !has : has;
	});
	const skipped = new Set(contactIds).size - todo.length;
	if (!todo.length) return { ok: true, done: [], skipped, dryRun: false, message: mode === 'add' ? `Everyone selected already has “${tagName}”.` : `No one selected has “${tagName}”.` };

	const done: number[] = [];
	let dryRun = false;
	for (const id of todo) {
		try {
			const res =
				mode === 'add'
					? await guards.create('contact.tags.add', { tags: [tagName] }, id)
					: await guards.create('contact.tags.remove', { tags: [existing!.id] }, id);
			dryRun = res.dryRun;
			done.push(id);
		} catch (err) {
			let why = 'something went wrong';
			if (err instanceof WriteRefusedError && err.reason === 'read-only') why = 'orbit is read-only (ORBIT_READ_ONLY=true)';
			else if (err instanceof WriteRefusedError) why = `orbit refused it (${err.reason})`;
			else if (err instanceof MonicaError) why = err.message;
			return { ok: false, done, skipped, dryRun, message: `${byId.get(id)!.name}: ${why}. Done for ${done.length} before this; the rest were not attempted.` };
		}
	}
	const n = done.length;
	const verb = mode === 'add' ? `Added “${tagName}” to` : `Removed “${tagName}” from`;
	return {
		ok: true,
		done,
		skipped,
		dryRun,
		message: `${dryRun ? 'Dry run: would have ' + verb.toLowerCase() : verb} ${n} ${n === 1 ? 'person' : 'people'}${skipped ? ` (${skipped} skipped: ${mode === 'add' ? 'already had it' : "didn't have it"})` : ''}.`
	};
}

/**
 * Several tags on one person (contact page, 2026-11-23): still one guarded
 * request per tag (the guard allows exactly one tag per request). Duplicates
 * and tags the person already has are skipped; stops at the first failure.
 */
export async function addTagsToContact(
	guards: Guards,
	contactId: number,
	rawNames: unknown,
	contacts: ContactCard[],
	tags: { id: number; name: string }[]
): Promise<TagSaveResult & { added: string[] }> {
	const names = z.array(z.string().max(255)).max(20).safeParse(rawNames);
	if (!names.success) return { ok: false, message: 'The form could not be read. Reload the page and try again.', done: [], skipped: 0, dryRun: false, added: [] };
	const unique: string[] = [];
	for (const n of names.data.map((x) => x.trim()).filter(Boolean)) {
		if (!unique.some((u) => u.localeCompare(n, undefined, { sensitivity: 'accent' }) === 0)) unique.push(n);
	}
	if (!unique.length) return { ok: false, message: 'Pick or type a tag.', done: [], skipped: 0, dryRun: false, added: [] };

	const added: string[] = [];
	let skipped = 0;
	let dryRun = false;
	for (const name of unique) {
		const r = await saveTags(guards, { mode: 'add', contactIds: [contactId], tag: name }, contacts, tags);
		if (!r.ok) {
			const before = added.length ? ` Added before this: ${added.join(', ')}.` : '';
			return { ...r, message: `“${name}”: ${r.message.replace(/^[^:]*: /, '')}${before}`, added };
		}
		dryRun ||= r.dryRun;
		const spelled = tags.find((t) => t.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)?.name ?? name;
		if (r.done.length) added.push(spelled);
		else skipped++;
	}
	const list = added.map((t) => `“${t}”`).join(', ');
	const message = added.length
		? `${dryRun ? 'Dry run: would have added' : 'Added'} ${list}${skipped ? ` (${skipped} already there)` : ''}.`
		: 'They already have those tags.';
	return { ok: true, message, done: added.length ? [contactId] : [], skipped, dryRun, added };
}

const sameTag = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
function why(err: unknown): string {
	if (err instanceof ConflictError) return 'the tag changed in Monica since this page loaded (reload and try again)';
	if (err instanceof WriteRefusedError && err.reason === 'read-only') return 'orbit is read-only (ORBIT_READ_ONLY=true)';
	if (err instanceof WriteRefusedError) return `orbit refused it (${err.reason})`;
	if (err instanceof MonicaError) return err.message;
	return 'something went wrong';
}

/** Rename one tag (2026-11-24): one guarded PUT; every contact keeps it. */
export async function renameTag(guards: Guards, form: FormData, tags: { id: number; name: string }[]): Promise<{ ok: boolean; message: string; dryRun: boolean }> {
	const parsed = z.object({ tagId: z.coerce.number().int().positive(), name: z.string().max(255), updatedAt: z.string().min(1).max(40) }).safeParse({ tagId: form.get('tagId'), name: form.get('name') ?? '', updatedAt: form.get('updatedAt') });
	if (!parsed.success) return { ok: false, dryRun: false, message: 'The form could not be read. Reload the page and try again.' };
	const { tagId, updatedAt } = parsed.data;
	const name = parsed.data.name.trim().replace(/\s+/g, ' ');
	const tag = tags.find((t) => t.id === tagId);
	if (!tag) return { ok: false, dryRun: false, message: 'That tag is not in Monica any more. Reload the page.' };
	if (!name) return { ok: false, dryRun: false, message: 'Type the new name.' };
	if (name === tag.name) return { ok: false, dryRun: false, message: 'That is already its name.' };
	const clash = tags.find((t) => t.id !== tagId && sameTag(t.name, name));
	if (clash) return { ok: false, dryRun: false, message: `There is already a tag called “${clash.name}”. Use “Merge into” to combine them.` };
	try {
		const res = await guards.update('tag.rename', tagId, { name }, updatedAt);
		return { ok: true, dryRun: res.dryRun, message: res.dryRun ? 'Dry run: the rename is in the audit log; nothing was sent.' : `Renamed “${tag.name}” to “${name}”.` };
	} catch (err) {
		return { ok: false, dryRun: false, message: `Not renamed: ${why(err)}.` };
	}
}

/**
 * Merge tag A into tag B (2026-11-24): for each person with A, add B (unless they
 * have it), then take A off. B is always added before A is removed, so nobody is
 * left without either. A stays in Monica, unused (orbit never deletes tags).
 * Stops at the first failure and reports progress.
 */
export async function mergeTags(
	guards: Guards,
	form: FormData,
	contacts: ContactCard[],
	tags: { id: number; name: string }[]
): Promise<{ ok: boolean; message: string; dryRun: boolean; moved: number }> {
	const parsed = z.object({ fromId: z.coerce.number().int().positive(), toId: z.coerce.number().int().positive() }).safeParse({ fromId: form.get('fromId'), toId: form.get('toId') });
	const fail = (message: string, moved = 0) => ({ ok: false, message, dryRun: false, moved });
	if (!parsed.success) return fail('Pick the tag to merge into.');
	const from = tags.find((t) => t.id === parsed.data.fromId);
	const to = tags.find((t) => t.id === parsed.data.toId);
	if (!from || !to) return fail('One of the tags is not in Monica any more. Reload the page.');
	if (from.id === to.id) return fail('Pick a different tag to merge into.');
	const people = contacts.filter((c) => c.tags.some((t) => sameTag(t, from.name)));
	if (!people.length) return { ok: true, dryRun: false, moved: 0, message: `No one has “${from.name}”; nothing to move.` };

	let moved = 0;
	let dryRun = false;
	for (const c of people) {
		try {
			if (!c.tags.some((t) => sameTag(t, to.name))) dryRun = (await guards.create('contact.tags.add', { tags: [to.name] }, c.id)).dryRun || dryRun;
			dryRun = (await guards.create('contact.tags.remove', { tags: [from.id] }, c.id)).dryRun || dryRun;
			moved++;
		} catch (err) {
			return fail(`${c.name}: ${why(err)}. Moved ${moved} of ${people.length} before this; the rest still have “${from.name}”.`, moved);
		}
	}
	return {
		ok: true,
		dryRun,
		moved,
		message: `${dryRun ? 'Dry run: would have moved' : 'Moved'} ${moved} ${moved === 1 ? 'person' : 'people'} from “${from.name}” to “${to.name}”. “${from.name}” is now unused; delete it in Monica if you like.`
	};
}
