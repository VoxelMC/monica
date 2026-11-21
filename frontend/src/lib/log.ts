// Logging hangouts and journal entries: client-safe types, validation and the
// exact payloads Monica expects. Slice 4 will send these through guards.ts;
// until then the Log page only previews them.
//
// Monica 4.1.2 (from its source):
//   POST /api/activities  { summary (required, <=255), description?, happened_at (Y-m-d),
//                           activity_type_id?, contacts: [ids] (required, >=1), emotions? }
//   POST /api/journal     { title (required, <=255), post (required) }  date: verify on staging

export interface DiaryItem {
	kind: 'hangout' | 'journal';
	id: number;
	date: string;
	title: string;
	body: string | null;
	type: string | null;
	people: { id: number; name: string }[];
}

export interface HangoutDraft {
	contactIds: number[];
	summary: string;
	description: string;
	date: string; // YYYY-MM-DD
	activityTypeId: number | null;
}

export interface JournalDraft {
	title: string;
	post: string;
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
