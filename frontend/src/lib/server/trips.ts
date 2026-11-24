// Souvenir lists per trip: orbit's own data (slice 5). Nothing here writes to Monica.
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { OrbitDb } from './db';
import { souvenirList, trips } from './db/schema';

export interface Trip {
	id: number;
	name: string;
	destination: string | null;
	startDate: string | null;
	endDate: string | null;
	people: { contactId: number; note: string; done: boolean }[];
}
type Result = { ok: boolean; message: string; id?: number };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export function listTrips(db: OrbitDb): Trip[] {
	const ts = db.select().from(trips).orderBy(desc(trips.startDate), desc(trips.id)).all();
	const items = db.select().from(souvenirList).all();
	return ts.map((t) => ({
		id: t.id,
		name: t.name,
		destination: t.destination,
		startDate: t.startDate,
		endDate: t.endDate,
		people: items.filter((i) => i.tripId === t.id).map((i) => ({ contactId: i.monicaContactId, note: i.note, done: i.done }))
	}));
}
export const getTrip = (db: OrbitDb, id: number) => listTrips(db).find((t) => t.id === id) ?? null;

/** Open souvenir items for one person (contact page). */
export function souvenirsFor(db: OrbitDb, contactId: number) {
	return listTrips(db)
		.flatMap((t) => t.people.filter((p) => p.contactId === contactId && !p.done).map((p) => ({ tripId: t.id, trip: t.name, note: p.note })));
}

function tripFields(form: FormData): { name: string; destination: string | null; startDate: string | null; endDate: string | null } | string {
	const name = text(form.get('name'), 80);
	const destination = text(form.get('destination'), 120) || null;
	const startDate = text(form.get('startDate'), 10) || null;
	const endDate = text(form.get('endDate'), 10) || null;
	if (!name) return 'Name the trip.';
	if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) return 'Dates look wrong.';
	if (startDate && endDate && endDate < startDate) return 'The trip ends before it starts.';
	return { name, destination, startDate, endDate };
}

export function createTrip(db: OrbitDb, form: FormData, now = new Date()): Result {
	const f = tripFields(form);
	if (typeof f === 'string') return { ok: false, message: f };
	const row = db.insert(trips).values({ ...f, createdAt: now.toISOString() }).returning({ id: trips.id }).get();
	return { ok: true, id: row.id, message: `Created “${f.name}”.` };
}

export function updateTrip(db: OrbitDb, id: number, form: FormData): Result {
	if (!getTrip(db, id)) return { ok: false, message: 'That trip is gone. Reload the page.' };
	const f = tripFields(form);
	if (typeof f === 'string') return { ok: false, message: f };
	db.update(trips).set(f).where(eq(trips.id, id)).run();
	return { ok: true, id, message: 'Saved.' };
}

/** Add people to the list (already-listed people are kept as they are). */
export function addPeople(db: OrbitDb, id: number, form: FormData, known: Set<number>): Result {
	const trip = getTrip(db, id);
	if (!trip) return { ok: false, message: 'That trip is gone. Reload the page.' };
	const ids = [...new Set(form.getAll('member').map((v) => z.coerce.number().int().positive().safeParse(v)).filter((r) => r.success).map((r) => r.data as number))];
	if (ids.some((m) => !known.has(m))) return { ok: false, message: 'Someone picked is not in Monica any more. Reload and try again.' };
	const add = ids.filter((m) => !trip.people.some((p) => p.contactId === m));
	if (add.length) db.insert(souvenirList).values(add.map((m) => ({ tripId: id, monicaContactId: m, note: '', done: false }))).run();
	return { ok: true, id, message: add.length ? `Added ${add.length} ${add.length === 1 ? 'person' : 'people'}.` : 'They are on the list already.' };
}

/** Update one person's note and tick, or take them off the list. */
export function updateItem(db: OrbitDb, id: number, form: FormData): Result {
	const contactId = Number(form.get('contactId'));
	const where = and(eq(souvenirList.tripId, id), eq(souvenirList.monicaContactId, contactId));
	if (!Number.isInteger(contactId) || !db.select().from(souvenirList).where(where).get()) return { ok: false, message: 'Not on this list any more. Reload the page.' };
	if (form.get('remove') === '1') {
		db.delete(souvenirList).where(where).run();
		return { ok: true, id, message: 'Taken off the list.' };
	}
	const set: { note?: string; done?: boolean } = {};
	if (form.has('note')) set.note = String(form.get('note') ?? '').trim().slice(0, 500);
	if (form.has('done')) set.done = form.get('done') === '1';
	db.update(souvenirList).set(set).where(where).run();
	return { ok: true, id, message: 'Saved.' };
}

export function deleteTrip(db: OrbitDb, id: number, form: FormData): Result {
	if (form.get('confirm') !== 'yes') return { ok: false, message: 'Tick the box to confirm.' };
	const t = getTrip(db, id);
	if (!t) return { ok: false, message: 'That trip is gone already.' };
	db.delete(trips).where(eq(trips.id, id)).run();
	return { ok: true, message: `Deleted “${t.name}” and its list.` };
}
