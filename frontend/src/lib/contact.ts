// Client-safe types and pure helpers for the contact page (slice 2).

export interface Birthday {
	/** Month and day, plus year when known. */
	month: number; // 1-12
	day: number;
	year: number | null;
	/** Age is approximate when Monica stored it from an age, not a date. */
	ageIsApprox: boolean;
}

export interface BirthdayInfo {
	label: string; // "March 11, 2001" or "March 11"
	age: number | null; // age now
	nextAge: number | null; // age at the next birthday
	daysUntil: number; // 0 = today
	nextIso: string; // YYYY-MM-DD of the next birthday
	ageIsApprox: boolean;
}

/** Parse Monica's special date ({ date: "2001-03-11T00:00:00Z", is_year_unknown, is_age_based }). */
export function parseBirthday(d: { date?: string | null; is_year_unknown?: boolean | null; is_age_based?: boolean | null } | null | undefined): Birthday | null {
	if (!d?.date) return null;
	// Use the date part only: it is a calendar date, not an instant.
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.date);
	if (!m) return null;
	return {
		year: d.is_year_unknown ? null : Number(m[1]),
		month: Number(m[2]),
		day: Number(m[3]),
		ageIsApprox: !!d.is_age_based
	};
}

const pad = (n: number) => String(n).padStart(2, '0');
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Birthday as it falls in a given year (Feb 29 -> Feb 28 in non-leap years). */
function inYear(b: Birthday, y: number): Date {
	const day = b.month === 2 && b.day === 29 && !isLeap(y) ? 28 : b.day;
	return new Date(y, b.month - 1, day);
}

export function birthdayInfo(b: Birthday, today = new Date()): BirthdayInfo {
	const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	let next = inYear(b, t.getFullYear());
	if (next < t) next = inYear(b, t.getFullYear() + 1);
	const daysUntil = Math.round((next.getTime() - t.getTime()) / 86_400_000);
	const nextAge = b.year === null ? null : next.getFullYear() - b.year;
	const age = nextAge === null ? null : daysUntil === 0 ? nextAge : nextAge - 1;
	const monthName = new Date(2000, b.month - 1, 1).toLocaleString('en', { month: 'long' });
	return {
		label: b.year === null || b.ageIsApprox ? `${monthName} ${b.day}` : `${monthName} ${b.day}, ${b.year}`,
		age,
		nextAge,
		daysUntil,
		nextIso: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
		ageIsApprox: b.ageIsApprox
	};
}

export type TimelineKind = 'note' | 'activity' | 'call' | 'conversation';

export interface TimelineItem {
	kind: TimelineKind;
	id: number;
	date: string; // ISO date or timestamp
	title: string;
	body: string | null;
	/** Monica's updated_at, for the conflict check when removing. */
	updatedAt?: string;
}

/** Newest first; ties keep a stable order by kind then id. */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
	return [...items].sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || b.id - a.id);
}

export interface ContactFieldView {
	label: string;
	value: string;
	/** Safe link, or null to show as text. */
	href: string | null;
}

/**
 * Build a link for a contact field. Only well-known schemes are linked: field
 * types (and their protocols) are user-defined in Monica, so a stored
 * "javascript:" protocol must never become a link.
 */
export function fieldHref(type: string | null | undefined, protocol: string | null | undefined, value: string): string | null {
	const v = value.trim();
	if (!v) return null;
	if (type === 'phone') return 'tel:' + v.replace(/[^\d+*#,;]/g, '');
	if (type === 'email') return /^[^\s@<>"]+@[^\s@<>"]+$/.test(v) ? 'mailto:' + v : null;
	if (/^https?:\/\//i.test(v)) return safeHttpUrl(v);
	const p = (protocol ?? '').toLowerCase();
	if (p === 'https:' || p === 'http:') return safeHttpUrl(v.includes('//') ? v : `${p}//${v}`);
	if (p === 'tel:' || p === 'sms:') return p + v.replace(/[^\d+*#,;]/g, '');
	if (p === 'mailto:') return /^[^\s@<>"]+@[^\s@<>"]+$/.test(v) ? 'mailto:' + v : null;
	return null;
}

export function safeHttpUrl(v: string | null | undefined): string | null {
	if (!v) return null;
	try {
		const u = new URL(v.trim());
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
	} catch {
		return null;
	}
}

/** OpenStreetMap search link for an address (works in every browser). */
export function mapHref(parts: (string | null | undefined)[]): string | null {
	const q = parts.filter((p) => p && p.trim()).join(', ');
	return q ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}` : null;
}

export interface ReminderView {
	id: number;
	title: string;
	/** Next time it is due (YYYY-MM-DD), today or later; null for a one-time reminder in the past. */
	next: string | null;
	daysUntil: number | null;
	frequency: string;
}

/**
 * Next occurrence of a Monica reminder: initial date, repeated every
 * `n` weeks/months/years (frequency_type 'week' | 'month' | 'year' | 'one_time').
 */
export function nextOccurrence(initialIso: string, type: string | null | undefined, n: number | null | undefined, today = new Date()): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(initialIso);
	if (!m) return null;
	const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const start = new Date(+m[1], +m[2] - 1, +m[3]);
	const step = Math.max(1, n ?? 1);
	const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	if (!type || type === 'one_time') return start >= t ? iso(start) : null;
	if (start >= t) return iso(start);
	if (type === 'week') {
		const days = Math.round((t.getTime() - start.getTime()) / 86_400_000);
		const k = Math.ceil(days / (7 * step));
		return iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + k * 7 * step));
	}
	const monthsPer = type === 'year' ? 12 * step : step;
	// Add whole periods; clamp the day (Jan 31 + 1 month -> Feb 28/29).
	const at = (k: number) => {
		const total = start.getMonth() + k * monthsPer;
		const y = start.getFullYear() + Math.floor(total / 12);
		const mo = ((total % 12) + 12) % 12;
		const last = new Date(y, mo + 1, 0).getDate();
		return new Date(y, mo, Math.min(start.getDate(), last));
	};
	let k = Math.max(0, Math.floor(((t.getFullYear() - start.getFullYear()) * 12 + t.getMonth() - start.getMonth()) / monthsPer));
	while (at(k) < t) k++;
	return iso(at(k));
}

export function daysFromToday(iso: string, today = new Date()): number {
	const [y, mo, d] = iso.split('-').map(Number);
	const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	return Math.round((new Date(y, mo - 1, d).getTime() - t.getTime()) / 86_400_000);
}
