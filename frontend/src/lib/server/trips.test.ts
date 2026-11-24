import { describe, expect, it } from 'vitest';
import { memoryAudit } from './monica/test-helpers';
import { addPeople, createTrip, deleteTrip, getTrip, listTrips, souvenirsFor, updateItem, updateTrip } from './trips';

const fd = (o: Record<string, string | string[]>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
	return f;
};
const known = new Set([1, 2, 3]);

describe('souvenir lists', () => {
	it('trip, people, notes, ticks, removal, delete with confirmation', () => {
		const { db } = memoryAudit();
		const t = createTrip(db, fd({ name: 'Lyon', destination: 'Lyon, France', startDate: '2026-12-18', endDate: '2026-12-28' }));
		expect(t).toMatchObject({ ok: true });
		expect(addPeople(db, t.id!, fd({ member: ['1', '2', '2'] }), known).message).toBe('Added 2 people.');
		expect(addPeople(db, t.id!, fd({ member: ['1'] }), known).message).toMatch(/already/);
		updateItem(db, t.id!, fd({ contactId: '1', note: ' Praline from Pralus ' }));
		expect(souvenirsFor(db, 1)).toEqual([{ tripId: t.id, trip: 'Lyon', note: 'Praline from Pralus' }]);
		updateItem(db, t.id!, fd({ contactId: '1', done: '1' }));
		expect(souvenirsFor(db, 1)).toEqual([]); // done ones don't show on the contact page
		expect(getTrip(db, t.id!)!.people.find((p) => p.contactId === 1)).toMatchObject({ note: 'Praline from Pralus', done: true });
		updateItem(db, t.id!, fd({ contactId: '2', remove: '1' }));
		expect(getTrip(db, t.id!)!.people.map((p) => p.contactId)).toEqual([1]);
		expect(updateTrip(db, t.id!, fd({ name: 'Lyon + Annecy', startDate: '2026-12-18', endDate: '2026-12-30' })).ok).toBe(true);
		expect(deleteTrip(db, t.id!, fd({})).ok).toBe(false);
		expect(deleteTrip(db, t.id!, fd({ confirm: 'yes' })).ok).toBe(true);
		expect(listTrips(db)).toEqual([]);
		expect(souvenirsFor(db, 1)).toEqual([]);
	});
	it('refuses bad input', () => {
		const { db } = memoryAudit();
		expect(createTrip(db, fd({ name: ' ' })).ok).toBe(false);
		expect(createTrip(db, fd({ name: 'X', startDate: '2026-12-10', endDate: '2026-12-01' })).message).toMatch(/ends before/);
		expect(createTrip(db, fd({ name: 'X', startDate: '10/12/2026' })).ok).toBe(false);
		const t = createTrip(db, fd({ name: 'Y' }));
		expect(addPeople(db, t.id!, fd({ member: ['9'] }), known).ok).toBe(false);
		expect(updateItem(db, t.id!, fd({ contactId: '3', note: 'x' })).ok).toBe(false);
	});
});
