import { describe, expect, it } from 'vitest';
import { birthdayPayload, checkBirthday, daysInMonth, type BirthdayBase } from './birthday-write';

const base: BirthdayBase = { id: 7, name: 'Ana Bernaz', firstName: 'Ana', description: 'Met in Paris', genderId: 2, isDead: false, deceased: null };

describe('birthday payload', () => {
	it('sets the birthday and resends what Monica would otherwise overwrite', () => {
		expect(birthdayPayload(base, { month: 3, day: 11, year: 2001 })).toEqual({
			first_name: 'Ana',
			gender_id: 2,
			description: 'Met in Paris',
			is_birthdate_known: true,
			birthdate_day: 11,
			birthdate_month: 3,
			birthdate_year: 2001,
			birthdate_is_age_based: false,
			birthdate_add_reminder: true,
			is_deceased: false,
			is_deceased_date_known: false
		});
	});
	it('never sends last name, nickname or middle name (Monica leaves unsent ones as they are)', () => {
		const p = birthdayPayload(base, { month: 1, day: 2, year: null }) as Record<string, unknown>;
		for (const k of ['last_name', 'middle_name', 'nickname']) expect(p).not.toHaveProperty(k);
		expect(p.birthdate_year).toBeNull();
	});
	it('keeps an existing deceased date and an empty description', () => {
		const p = birthdayPayload({ ...base, description: null, genderId: null, isDead: true, deceased: { day: 5, month: 6, year: 2020 } }, { month: 1, day: 2, year: 1950 });
		expect(p).toMatchObject({ description: null, is_deceased: true, is_deceased_date_known: true, deceased_date_day: 5, deceased_date_month: 6, deceased_date_year: 2020 });
		expect(p).not.toHaveProperty('gender_id');
	});
});

describe('validation', () => {
	const today = new Date(2026, 10, 22);
	it('accepts real dates, with or without a year', () => {
		expect(checkBirthday({ month: 2, day: 29, year: null }, today)).toBeNull();
		expect(checkBirthday({ month: 2, day: 29, year: 2000 }, today)).toBeNull();
	});
	it('rejects impossible or future dates', () => {
		expect(checkBirthday({ month: 2, day: 29, year: 2001 }, today)).toMatch(/does not exist/);
		expect(checkBirthday({ month: 4, day: 31, year: null }, today)).toMatch(/does not exist/);
		expect(checkBirthday({ month: 12, day: 1, year: 2026 }, today)).toMatch(/future/);
		expect(checkBirthday({ month: 0, day: 1, year: null }, today)).toMatch(/month/);
		expect(checkBirthday({ month: 5, day: 0, year: null }, today)).toMatch(/day/);
	});
	it('days in month', () => {
		expect([daysInMonth(2, null), daysInMonth(2, 2023), daysInMonth(4, null), daysInMonth(12, null)]).toEqual([29, 28, 30, 31]);
	});
});
