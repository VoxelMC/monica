// Client-safe contact list types and pure helpers (search, filter, sort).

export interface ContactCard {
	id: number;
	name: string;
	firstName: string | null;
	lastName: string | null;
	nickname: string | null;
	initials: string;
	color: string;
	hasPhoto: boolean;
	starred: boolean;
	tags: string[];
	/** Most recent of last activity together and last call, ISO date or null. */
	lastContacted: string | null;
	createdAt: string;
	phones: string[];
	emails: string[];
	/** Calendar birthday (year null when unknown); null if none or deceased. */
	birthday?: import('./contact').Birthday | null;
	/** Monica's "stay in touch" target in days, if set. */
	stayInTouchDays?: number | null;
	updatedAt?: string;
}

export type SortKey = 'name' | 'last-contacted' | 'recent';
export const SORT_KEYS: SortKey[] = ['name', 'last-contacted', 'recent'];

export function parseSort(v: string | null | undefined): SortKey {
	return SORT_KEYS.includes(v as SortKey) ? (v as SortKey) : 'name';
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Lowercase and strip accents, so "Zoé" matches "zoe". */
export function fold(s: string): string {
	return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export const digits = (s: string) => s.replace(/\D/g, '');
const PHONE_LIKE = /^[\d\s+().-]+$/;

/**
 * Every whitespace-separated term must match one of: name, nickname, email,
 * or (for terms with 3+ digits) a phone number, ignoring spaces, dashes,
 * brackets and a leading +.
 */
export function matches(c: ContactCard, query: string): boolean {
	const terms = fold(query).split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const text = fold([c.name, c.firstName, c.lastName, c.nickname, ...c.emails].filter(Boolean).join(' '));
	const phones = c.phones.map(digits);
	const phoneMatch = (s: string) => {
		const d = digits(s);
		// Only digit-like text (e.g. "+1 604 555", "555-01") is matched against phones.
		return d.length >= 3 && PHONE_LIKE.test(s) && phones.some((p) => p.includes(d));
	};
	// A whole query like "+1 604 555" is one phone number, not three terms.
	if (phoneMatch(query.trim())) return true;
	return terms.every((t) => text.includes(t) || phoneMatch(t));
}

export interface TagFilter {
	tags: string[];
	/** 'any': has at least one of the tags; 'all': has every tag. */
	mode: 'any' | 'all';
	untagged: boolean;
}

export const NO_TAG_FILTER: TagFilter = { tags: [], mode: 'any', untagged: false };

export function matchesTags(c: ContactCard, f: TagFilter): boolean {
	if (f.untagged && c.tags.length) return false;
	if (!f.tags.length) return true;
	return f.mode === 'all' ? f.tags.every((t) => c.tags.includes(t)) : f.tags.some((t) => c.tags.includes(t));
}

export function searchContacts(list: ContactCard[], query: string, filter: TagFilter | string | null = null): ContactCard[] {
	const f: TagFilter = typeof filter === 'string' ? { ...NO_TAG_FILTER, tags: [filter] } : (filter ?? NO_TAG_FILTER);
	return list.filter((c) => matchesTags(c, f) && matches(c, query));
}

/** Read the tag filter from URL params: ?tag=a&tag=b&tagmode=all&untagged=1 */
export function parseTagFilter(params: Pick<URLSearchParams, 'get' | 'getAll'>): TagFilter {
	return {
		tags: [...new Set(params.getAll('tag').filter(Boolean))],
		mode: params.get('tagmode') === 'all' ? 'all' : 'any',
		untagged: params.get('untagged') === '1'
	};
}

export function tagFilterParams(f: TagFilter, params = new URLSearchParams()): URLSearchParams {
	for (const t of f.tags) params.append('tag', t);
	if (f.tags.length > 1 && f.mode === 'all') params.set('tagmode', 'all');
	if (f.untagged) params.set('untagged', '1');
	return params;
}

/** Tag name -> number of contacts, plus tags with no contacts (from /api/tags). */
export function tagCounts(list: ContactCard[], known: string[] = []): { name: string; count: number }[] {
	const counts = new Map<string, number>(known.map((k) => [k, 0]));
	for (const c of list) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
	return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
}

/** Text for the clipboard: one "Name <value>" line per value. */
export function clipboardList(list: ContactCard[], kind: 'emails' | 'phones'): { text: string; count: number; missing: number } {
	const lines: string[] = [];
	let missing = 0;
	for (const c of list) {
		const values = c[kind];
		if (!values.length) missing++;
		for (const v of values) lines.push(kind === 'emails' ? `${c.name} <${v}>` : `${c.name}: ${v}`);
	}
	return { text: lines.join('\n'), count: lines.length, missing };
}

export function sortContacts(list: ContactCard[], key: SortKey): ContactCard[] {
	const out = [...list];
	const byName = (a: ContactCard, b: ContactCard) => collator.compare(a.name, b.name);
	if (key === 'name') out.sort(byName);
	else if (key === 'recent') out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b));
	else
		out.sort((a, b) => {
			// Most recently contacted first; never-contacted at the end.
			if (a.lastContacted && b.lastContacted) return b.lastContacted.localeCompare(a.lastContacted) || byName(a, b);
			if (a.lastContacted) return -1;
			if (b.lastContacted) return 1;
			return byName(a, b);
		});
	return out;
}

export function allTags(list: ContactCard[]): string[] {
	return [...new Set(list.flatMap((c) => c.tags))].sort(collator.compare);
}

/** "today", "3 days ago", "in 12 days", "2 months ago"... */
export function relativeDate(iso: string, now = new Date()): string {
	const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
	const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
	if (days === 0) return 'today';
	if (days === -1) return 'yesterday';
	if (days === 1) return 'tomorrow';
	const abs = Math.abs(days);
	const [n, unit] =
		abs < 14 ? [abs, 'day'] : abs < 60 ? [Math.round(abs / 7), 'week'] : abs < 730 ? [Math.round(abs / 30.44), 'month'] : [Math.round(abs / 365.25), 'year'];
	const s = `${n} ${unit}${n === 1 ? '' : 's'}`;
	return days < 0 ? `${s} ago` : `in ${s}`;
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function fullDate(iso: string): string {
	const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** First + last name; Monica's complete_name can embed the nickname, e.g. "Ana Bernaz (Ana)". */
export function displayName(first: string | null, last: string | null, complete: string): string {
	return [first, last].filter((s) => s && s.trim()).join(' ') || complete;
}
