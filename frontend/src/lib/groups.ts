// Friend group stats (slice 5): computed from Monica's activities and contacts,
// for members stored in orbit's database.
import type { ContactCard } from './contacts';

export interface Hangout {
	id: number;
	date: string; // YYYY-MM-DD…
	title: string;
	people: number[];
}

export interface GroupStats {
	/** Latest hangout with at least two members (or the only member, for a group of one). */
	lastTogether: { id: number; date: string; title: string; who: number } | null;
	/** Group hangouts in the last 365 days. */
	hangoutsThisYear: number;
	members: { card: ContactCard; daysSince: number | null; overdueBy: number | null }[];
}

const DAY = 86_400_000;
const days = (iso: string, today: Date) => Math.floor((today.getTime() - Date.parse(iso.slice(0, 10) + 'T00:00:00Z')) / DAY);

export function groupStats(memberIds: number[], cards: ContactCard[], hangouts: Hangout[], today = new Date()): GroupStats {
	const ids = new Set(memberIds);
	const need = Math.min(2, ids.size);
	const together = need
		? hangouts.filter((h) => h.people.filter((p) => ids.has(p)).length >= need).sort((a, b) => b.date.localeCompare(a.date))
		: [];
	const last = together[0];
	const byId = new Map(cards.map((c) => [c.id, c]));
	const members = memberIds
		.map((id) => byId.get(id))
		.filter((c): c is ContactCard => !!c)
		.map((card) => {
			const since = card.lastContacted ? days(card.lastContacted, today) : null;
			const target = card.stayInTouchDays ?? null;
			const overdueBy = target ? (since === null ? target : since - target > 0 ? since - target : null) : null;
			return { card, daysSince: since, overdueBy };
		})
		.sort((a, b) => (b.overdueBy ?? -1) - (a.overdueBy ?? -1) || (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9));
	return {
		lastTogether: last ? { id: last.id, date: last.date.slice(0, 10), title: last.title, who: last.people.filter((p) => ids.has(p)).length } : null,
		hangoutsThisYear: together.filter((h) => days(h.date, today) <= 365).length,
		members
	};
}
