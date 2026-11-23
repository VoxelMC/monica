// Timed reminders (2026-11-23): shared by the browser (quick picks, display)
// and the server (validation). Times are stored in UTC with the IANA time zone
// the owner picked them in, so they display the same wherever orbit runs.

export const NOTE_MAX = 500;
/** How far in the past a new reminder may be (the form took a while to submit). */
const PAST_GRACE_MS = 5 * 60_000;
const MAX_AHEAD_MS = 2 * 366 * 24 * 3600_000;

export interface ReminderDraft {
	note: string;
	dueAt: string;
	timeZone: string;
}

export function validTimeZone(tz: string): boolean {
	if (!tz || tz.length > 64) return false;
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Returns a reason the draft cannot be saved, or null. */
export function checkReminder(d: ReminderDraft, now = new Date()): string | null {
	if (d.note.length > NOTE_MAX) return `The note is too long (up to ${NOTE_MAX} characters).`;
	const t = Date.parse(d.dueAt);
	if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?Z$/.test(d.dueAt) || Number.isNaN(t)) return 'Pick a time.';
	if (t < now.getTime() - PAST_GRACE_MS) return 'That time has already passed.';
	if (t > now.getTime() + MAX_AHEAD_MS) return 'That is more than two years away.';
	if (!validTimeZone(d.timeZone)) return 'Your time zone could not be read. Reload and try again.';
	return null;
}

/** Calendar parts of an instant in a time zone. */
function parts(date: Date, timeZone: string) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
			.formatToParts(date)
			.map((x) => [x.type, x.value])
	);
	return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const dayNumber = (isoDay: string) => Math.round(Date.parse(isoDay + 'T00:00:00Z') / 86_400_000);

/** "Today 15:40", "Tomorrow 09:00", "Fri 27 Nov, 15:40" (in the reminder's time zone). */
export function formatDue(dueAt: string, timeZone: string, now = new Date()): string {
	const due = new Date(dueAt);
	const tz = validTimeZone(timeZone) ? timeZone : 'UTC';
	const d = parts(due, tz);
	const diff = dayNumber(d.day) - dayNumber(parts(now, tz).day);
	if (diff === 0) return `Today ${d.time}`;
	if (diff === 1) return `Tomorrow ${d.time}`;
	if (diff === -1) return `Yesterday ${d.time}`;
	const label = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: Math.abs(diff) > 300 ? 'numeric' : undefined }).format(due);
	return `${label}, ${d.time}`;
}

/** "in 2 h 5 min", "in 3 days", "5 min ago". */
export function relativeDue(dueAt: string, now = new Date()): string {
	const ms = Date.parse(dueAt) - now.getTime();
	const abs = Math.abs(ms);
	const min = Math.round(abs / 60_000);
	let s: string;
	if (min < 1) return 'now';
	if (min < 60) s = `${min} min`;
	else if (min < 48 * 60) {
		const h = Math.floor(min / 60);
		const m = min % 60;
		s = m && h < 6 ? `${h} h ${m} min` : `${Math.round(min / 60)} h`;
	} else s = `${Math.round(min / 1440)} days`;
	return ms >= 0 ? `in ${s}` : `${s} ago`;
}

/** Quick choices for the form, in the browser's local time. */
export function quickPicks(now = new Date()): { label: string; at: Date }[] {
	const at = (h: number, m: number, addDays = 0) => {
		const d = new Date(now);
		d.setDate(d.getDate() + addDays);
		d.setHours(h, m, 0, 0);
		return d;
	};
	const picks = [
		{ label: 'In 1 hour', at: new Date(now.getTime() + 3600_000) },
		{ label: 'In 3 hours', at: new Date(now.getTime() + 3 * 3600_000) }
	];
	if (now.getHours() < 18) picks.push({ label: 'This evening', at: at(19, 0) });
	picks.push({ label: 'Tomorrow morning', at: at(9, 0, 1) });
	return picks;
}

/** Value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInput(d: Date): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
