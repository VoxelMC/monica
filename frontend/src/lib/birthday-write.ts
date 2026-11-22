// Adding a birthday = PUT /api/contacts/{id}. Monica's UpdateContact (v4.1.2):
//  - updates only the name/gender fields that are sent (so we leave them out,
//    except first_name, which is required and sent unchanged, and gender_id,
//    sent unchanged when known);
//  - always rewrites description, birthday and deceased details from the request,
//    so those are sent back exactly as they are now (fetch, merge, then send).
// Slice 4 will send this through guards.ts after a fresh GET; for now it is preview only.

export interface BirthdayBase {
	id: number;
	name: string;
	firstName: string;
	description: string | null;
	genderId: number | null;
	isDead: boolean;
	deceased: { day: number; month: number; year: number | null } | null;
}

export interface NewBirthday {
	month: number; // 1-12
	day: number; // 1-31
	year: number | null;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function daysInMonth(month: number, year: number | null): number {
	if (month === 2) return year === null || isLeap(year) ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function checkBirthday(b: Partial<NewBirthday>, today = new Date()): string | null {
	if (!b.month || b.month < 1 || b.month > 12) return 'Pick a month.';
	if (!b.day || b.day < 1) return 'Pick a day.';
	if (b.day > daysInMonth(b.month, b.year ?? null)) return 'That day does not exist in that month.';
	if (b.year != null) {
		if (!Number.isInteger(b.year) || b.year < 1900) return 'Year looks wrong.';
		const d = new Date(b.year, b.month - 1, b.day);
		if (d > today) return 'That date is in the future.';
	}
	return null;
}

/** The exact PUT body that sets a birthday and changes nothing else. */
export function birthdayPayload(base: BirthdayBase, b: NewBirthday) {
	return {
		first_name: base.firstName,
		description: base.description,
		is_birthdate_known: true,
		birthdate_day: b.day,
		birthdate_month: b.month,
		birthdate_year: b.year,
		birthdate_is_age_based: false,
		birthdate_add_reminder: true, // Monica's default: a yearly "wish happy birthday" reminder
		is_deceased: base.isDead,
		is_deceased_date_known: base.deceased !== null,
		...(base.deceased
			? { deceased_date_day: base.deceased.day, deceased_date_month: base.deceased.month, deceased_date_year: base.deceased.year }
			: {})
	};
}

type Json = Record<string, unknown>;
const datePart = (v: unknown) => {
	const d = (v as { date?: string | null } | null | undefined)?.date;
	const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
	return m ? { year: +m[1], month: +m[2], day: +m[3], yearUnknown: !!(v as { is_year_unknown?: boolean }).is_year_unknown } : null;
};

/** True if Monica already has a birthday for this contact (GET /api/contacts/{id} data). */
export function contactHasBirthday(current: Json): boolean {
	const info = current.information as { dates?: { birthdate?: unknown } } | undefined;
	return datePart(info?.dates?.birthdate) !== null;
}

/**
 * The fields Monica's UpdateContact always rewrites, taken from the contact as it is
 * now (fresh GET), so a birthday update changes nothing else. Name fields other than
 * the required first_name, and gender, are left out: Monica keeps unsent ones.
 */
export function basePayloadFromContact(current: Json): Json {
	if (typeof current.first_name !== 'string' || !current.first_name) throw new Error('Contact has no first name');
	const info = current.information as { dates?: { deceased_date?: unknown } } | undefined;
	const dd = datePart(info?.dates?.deceased_date);
	return {
		first_name: current.first_name,
		description: (current.description as string | null | undefined) ?? null,
		is_deceased: !!current.is_dead,
		is_deceased_date_known: dd !== null,
		...(dd ? { deceased_date_day: dd.day, deceased_date_month: dd.month, deceased_date_year: dd.yearUnknown ? null : dd.year } : {})
	};
}

/** The birthday part of the update (merged over basePayloadFromContact). */
export function birthdayChanges(b: NewBirthday) {
	return {
		is_birthdate_known: true,
		birthdate_day: b.day,
		birthdate_month: b.month,
		birthdate_year: b.year,
		birthdate_is_age_based: false,
		birthdate_add_reminder: true
	};
}
