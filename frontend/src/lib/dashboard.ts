// Dashboard (slice 3): pure, client-safe selectors over the contact list.
import { birthdayInfo, type BirthdayInfo } from './contact';
import type { ContactCard } from './contacts';

export interface UpcomingBirthday {
	contact: ContactCard;
	info: BirthdayInfo;
}

/** Birthdays from today through `days` days ahead, soonest first. */
export function upcomingBirthdays(list: ContactCard[], today = new Date(), days = 30): UpcomingBirthday[] {
	return list
		.filter((c) => c.birthday)
		.map((c) => ({ contact: c, info: birthdayInfo(c.birthday!, today) }))
		.filter((b) => b.info.daysUntil <= days)
		.sort((a, b) => a.info.daysUntil - b.info.daysUntil || a.contact.name.localeCompare(b.contact.name));
}

export interface Overdue {
	contact: ContactCard;
	/** Days since last contact (null: never). */
	daysSince: number | null;
	targetDays: number;
	/** How far past the target, in days (target days if never contacted). */
	overdueBy: number;
}

const dayMs = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function daysBetween(iso: string, today: Date): number {
	const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
	return Math.round((startOfDay(today) - startOfDay(d)) / dayMs);
}

/**
 * "Catch up soon": people with a stay-in-touch target whose last contact is
 * older than the target (or who were never contacted), most overdue first.
 */
export function catchUpSoon(list: ContactCard[], today = new Date()): Overdue[] {
	const out: Overdue[] = [];
	for (const c of list) {
		const target = c.stayInTouchDays;
		if (!target || target <= 0) continue;
		const since = c.lastContacted ? daysBetween(c.lastContacted, today) : null;
		if (since === null || since > target) {
			out.push({ contact: c, daysSince: since, targetDays: target, overdueBy: since === null ? target : since - target });
		}
	}
	return out.sort((a, b) => b.overdueBy - a.overdueBy || a.contact.name.localeCompare(b.contact.name));
}

export interface RecentChange {
	contact: ContactCard;
	kind: 'added' | 'updated';
	at: string;
}

/** Most recently added or updated contacts. An update within a minute of creation counts as "added". */
export function recentlyChanged(list: ContactCard[], limit = 5): RecentChange[] {
	return list
		.map((c) => {
			const updated = c.updatedAt ?? c.createdAt;
			const isNew = Math.abs(Date.parse(updated) - Date.parse(c.createdAt)) < 60_000;
			return { contact: c, kind: isNew ? ('added' as const) : ('updated' as const), at: isNew ? c.createdAt : updated };
		})
		.sort((a, b) => b.at.localeCompare(a.at) || b.contact.id - a.contact.id)
		.slice(0, limit);
}
