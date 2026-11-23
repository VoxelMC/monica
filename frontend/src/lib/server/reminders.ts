// Timed reminders: orbit's own data (extension DB). Nothing here talks to Monica.
import { and, asc, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { checkReminder, formatDue, NOTE_MAX } from '../reminders';
import type { OrbitDb } from './db';
import { reminders } from './db/schema';
import type { Notification } from './ntfy';

export type Reminder = typeof reminders.$inferSelect;

const draft = z.object({
	contactId: z.coerce.number().int().positive(),
	note: z.string().max(NOTE_MAX * 2).default(''),
	dueAt: z.string().max(40),
	timeZone: z.string().max(64)
});

export type ReminderResult = { ok: true; message: string; id: number } | { ok: false; message: string };

/** Create from a form. `contactName` returns the contact's name, or null if not in Monica. */
export async function createReminder(
	db: OrbitDb,
	form: FormData,
	contactName: (id: number) => Promise<string | null>,
	now = new Date()
): Promise<ReminderResult> {
	const parsed = draft.safeParse({ contactId: form.get('contactId'), note: form.get('note') ?? '', dueAt: form.get('dueAt'), timeZone: form.get('timeZone') });
	if (!parsed.success) return { ok: false, message: 'Pick a time.' };
	const d = { ...parsed.data, note: parsed.data.note.trim() };
	const problem = checkReminder(d, now);
	if (problem) return { ok: false, message: problem };
	let name: string | null;
	try {
		name = await contactName(d.contactId);
	} catch {
		return { ok: false, message: 'Monica could not be reached to check the contact. Try again in a moment.' };
	}
	if (!name) return { ok: false, message: 'That contact is not in Monica any more.' };
	const dueAt = new Date(d.dueAt).toISOString();
	const row = db
		.insert(reminders)
		.values({ monicaContactId: d.contactId, contactName: name, note: d.note, dueAt, timeZone: d.timeZone, createdAt: now.toISOString() })
		.returning({ id: reminders.id })
		.get();
	return { ok: true, id: row.id, message: `Reminder set for ${formatDue(dueAt, d.timeZone, now)}.` };
}

/** Not done yet, soonest first (sent ones stay until marked done). Optionally for one contact. */
export function openReminders(db: OrbitDb, contactId?: number): Reminder[] {
	const where = contactId ? and(isNull(reminders.doneAt), eq(reminders.monicaContactId, contactId)) : isNull(reminders.doneAt);
	return db.select().from(reminders).where(where).orderBy(asc(reminders.dueAt)).all();
}

export function recentlyDone(db: OrbitDb, limit = 20): Reminder[] {
	return db.select().from(reminders).where(isNotNull(reminders.doneAt)).orderBy(desc(reminders.doneAt)).limit(limit).all();
}

const idOf = (form: FormData) => {
	const n = Number(form.get('id'));
	return Number.isInteger(n) && n > 0 ? n : null;
};

export function markDone(db: OrbitDb, form: FormData, now = new Date()): ReminderResult {
	const id = idOf(form);
	if (!id) return { ok: false, message: 'Reminder not found.' };
	const r = db.update(reminders).set({ doneAt: now.toISOString() }).where(and(eq(reminders.id, id), isNull(reminders.doneAt))).run();
	return r.changes ? { ok: true, id, message: 'Done.' } : { ok: false, message: 'Reminder not found.' };
}

/** Move a reminder later: `minutes` from now, or to an exact `dueAt`. It will be sent again. */
export function snooze(db: OrbitDb, form: FormData, now = new Date()): ReminderResult {
	const id = idOf(form);
	if (!id) return { ok: false, message: 'Reminder not found.' };
	const current = db.select().from(reminders).where(eq(reminders.id, id)).get();
	if (!current || current.doneAt) return { ok: false, message: 'Reminder not found.' };
	const minutes = Number(form.get('minutes'));
	const dueAt = Number.isInteger(minutes) && minutes > 0 && minutes <= 60 * 24 * 30 ? new Date(now.getTime() + minutes * 60_000).toISOString() : String(form.get('dueAt') ?? '');
	const problem = checkReminder({ note: current.note, dueAt, timeZone: current.timeZone }, now);
	if (problem) return { ok: false, message: problem };
	db.update(reminders)
		.set({ dueAt: new Date(dueAt).toISOString(), sentAt: null, attempts: 0, lastAttemptAt: null, lastError: null })
		.where(eq(reminders.id, id))
		.run();
	return { ok: true, id, message: `Moved to ${formatDue(dueAt, current.timeZone, now)}.` };
}

/** Delete a reminder (orbit's own data; Monica is not involved). */
export function deleteReminder(db: OrbitDb, form: FormData): ReminderResult {
	const id = idOf(form);
	if (!id) return { ok: false, message: 'Reminder not found.' };
	const r = db.delete(reminders).where(eq(reminders.id, id)).run();
	return r.changes ? { ok: true, id, message: 'Reminder removed.' } : { ok: false, message: 'Reminder not found.' };
}

// ---- Sending

/** Wait before retrying a failed send: 1, 2, 4 … minutes, at most an hour. */
export function retryDelayMs(attempts: number): number {
	return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
}
export const MAX_ATTEMPTS = 20;

/** Reminders due now that have not been sent, minus ones waiting to retry. */
export function dueToSend(db: OrbitDb, now = new Date()): Reminder[] {
	return db
		.select()
		.from(reminders)
		.where(and(isNull(reminders.sentAt), isNull(reminders.doneAt), lte(reminders.dueAt, now.toISOString())))
		.orderBy(asc(reminders.dueAt))
		.all()
		.filter((r) => r.attempts < MAX_ATTEMPTS && (!r.lastAttemptAt || now.getTime() - Date.parse(r.lastAttemptAt) >= retryDelayMs(r.attempts)));
}

export function notificationFor(r: Reminder, publicUrl: string | undefined, now = new Date()): Notification {
	const lateMin = Math.round((now.getTime() - Date.parse(r.dueAt)) / 60_000);
	const late = lateMin > 15 ? ` (late: was due ${formatDue(r.dueAt, r.timeZone, now)})` : '';
	return {
		title: r.contactName,
		message: (r.note || `Reminder about ${r.contactName}`) + late,
		click: publicUrl ? `${publicUrl}/contacts/${r.monicaContactId}` : undefined,
		tags: ['bell']
	};
}

export function recordSent(db: OrbitDb, id: number, now = new Date()) {
	db.update(reminders).set({ sentAt: now.toISOString(), lastAttemptAt: now.toISOString(), lastError: null }).where(eq(reminders.id, id)).run();
}

export function recordFailure(db: OrbitDb, r: Reminder, error: string, now = new Date()) {
	db.update(reminders)
		.set({ attempts: r.attempts + 1, lastAttemptAt: now.toISOString(), lastError: error.slice(0, 300) })
		.where(eq(reminders.id, r.id))
		.run();
}
