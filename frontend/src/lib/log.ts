// Logging hangouts and journal entries: client-safe types, validation and the
// exact payloads Monica expects. Slice 4 will send these through guards.ts;
// until then the Log page only previews them.
//
// Monica 4.1.2 (from its source):
//   POST /api/activities  { summary (required, <=255), description?, happened_at (Y-m-d),
//                           activity_type_id?, contacts: [ids] (required, >=1), emotions? }
//   POST /api/journal     { title (required, <=255), post (required) }  date: verify on staging
//   POST /api/notes       { contact_id (required), body (required, <=100000), is_favorited? }

export interface DiaryItem {
	kind: 'hangout' | 'journal';
	id: number;
	date: string;
	title: string;
	body: string | null;
	type: string | null;
	people: { id: number; name: string; hashId?: string | null }[];
	/** Monica's updated_at, for the conflict check when removing. */
	updatedAt?: string;
}

export interface HangoutDraft {
	contactIds: number[];
	/** Per-person notes ("what I learned about them"), keyed by contact id. */
	personNotes?: Record<number, string>;
	summary: string;
	description: string;
	date: string; // YYYY-MM-DD
	activityTypeId: number | null;
}

export interface JournalDraft {
	title: string;
	post: string;
	/** People picked with @ in the text. Stored by orbit, not Monica. */
	mentions?: Mention[];
}

export interface Mention {
	contactId: number;
	name: string;
}

export type Problems = Partial<Record<string, string>>;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

export function todayIso(now = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function checkHangout(d: HangoutDraft, today = todayIso()): Problems {
	const p: Problems = {};
	if (!d.contactIds.length) p.people = 'Pick at least one person.';
	if (!d.summary.trim()) p.summary = 'Say what you did, e.g. “Dinner at Ana’s”.';
	else if (d.summary.trim().length > 255) p.summary = 'Keep the summary under 255 characters.';
	if (!isDate(d.date)) p.date = 'Pick a date.';
	else if (d.date > today) p.date = 'That date is in the future.';
	return p;
}

export function checkJournal(d: JournalDraft): Problems {
	const p: Problems = {};
	if (!d.title.trim()) p.title = 'Give the entry a title.';
	else if (d.title.trim().length > 255) p.title = 'Keep the title under 255 characters.';
	if (!d.post.trim()) p.post = 'Write something.';
	return p;
}

/** The body for POST /api/activities. */
export function hangoutPayload(d: HangoutDraft) {
	return {
		summary: d.summary.trim(),
		...(d.description.trim() ? { description: d.description.trim() } : {}),
		happened_at: d.date,
		...(d.activityTypeId ? { activity_type_id: d.activityTypeId } : {}),
		contacts: [...new Set(d.contactIds)]
	};
}

/** The body for POST /api/journal. */
export function journalPayload(d: JournalDraft) {
	return { title: d.title.trim(), post: d.post.trim() };
}

/** Parse ?people=1,2,3 (from select mode or a contact page). */
export function parsePeople(v: string | null): number[] {
	if (!v) return [];
	return [...new Set(v.split(',').map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Header that makes a per-person note read well on its own, on their page or in Monica. */
export function noteHeader(summary: string, date: string): string {
	return `From: ${summary.trim()} · ${date}`;
}

/** One POST /api/notes body per person with a non-empty note (only people still in the hangout). */
export function personNotePayloads(d: HangoutDraft) {
	const ids = new Set(d.contactIds);
	return Object.entries(d.personNotes ?? {})
		.map(([id, text]) => [Number(id), text.trim()] as const)
		.filter(([id, text]) => ids.has(id) && text)
		.map(([id, text]) => ({ contact_id: id, body: `${noteHeader(d.summary, d.date)}\n\n${text}` }));
}

export function checkPersonNotes(d: HangoutDraft): Problems {
	const long = personNotePayloads(d).find((n) => n.body.length > 100_000);
	return long ? { notes: 'One of the notes is too long (100,000 characters max).' } : {};
}

/**
 * The @-query being typed at the caret, if any: "@an" -> "an". A mention starts
 * at the start of the text or after whitespace and may contain one space
 * ("@ana be"), so full names can be searched.
 */
export function mentionQuery(text: string, caret: number): { query: string; start: number } | null {
	const before = text.slice(0, caret);
	const m = /(^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(before);
	if (!m) return null;
	return { query: m[2], start: caret - m[2].length - 1 };
}

/** Replace the @-query at `start..caret` with "@Full Name ". Returns the new text and caret. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
	const inserted = `@${name} `;
	return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

/** Keep only mentions whose "@Name" is still in the text (the user may have deleted it), once each. */
export function activeMentions(text: string, mentions: Mention[]): Mention[] {
	const seen = new Set<number>();
	return mentions.filter((m) => {
		if (seen.has(m.contactId) || !text.includes(`@${m.name}`)) return false;
		seen.add(m.contactId);
		return true;
	});
}

/** Rank people for an @-query: a word starting with the query first, then other matches. */
export function rankForMention<T extends { name: string; nickname: string | null }>(list: T[], query: string, fold: (s: string) => string): T[] {
	const q = fold(query.trim());
	if (!q) return list;
	const score = (c: T) => {
		const words = fold([c.name, c.nickname].filter(Boolean).join(' ')).split(/\s+/);
		const full = fold(c.name);
		if (full.startsWith(q)) return 0;
		if (words.some((w) => w.startsWith(q))) return 1;
		return 2;
	};
	return [...list].sort((a, b) => score(a) - score(b));
}

/** After "@Name " was inserted, typing punctuation should replace the trailing space: "@Ana." */
export function snapPunctuation(text: string, caret: number, key: string, insertedAt: number | null): { text: string; caret: number } | null {
	if (insertedAt === null || caret !== insertedAt || !/^[.,!?;:)]$/.test(key) || text[caret - 1] !== ' ') return null;
	return { text: text.slice(0, caret - 1) + key + text.slice(caret), caret };
}
