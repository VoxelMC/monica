// Catch-up targets (orbit's own data, slice 5). Nothing here writes to Monica.
import { eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { ContactCard } from '../contacts';
import type { OrbitDb } from './db';
import { contactMeta } from './db/schema';

export const MAX_TARGET_DAYS = 3650;

/** orbit targets by contact id. */
export function catchupTargets(db: OrbitDb): Map<number, number> {
	const rows = db.select().from(contactMeta).where(isNotNull(contactMeta.catchupIntervalDays)).all();
	return new Map(rows.map((r) => [r.monicaContactId, r.catchupIntervalDays!]));
}

/**
 * The target each card should use: orbit's if set, otherwise Monica's stay-in-touch.
 * `targetSource` says which, so the UI can say where it comes from.
 */
export function withTargets<T extends ContactCard>(cards: T[], targets: Map<number, number>): T[] {
	return cards.map((c) => {
		const own = targets.get(c.id);
		if (own) return { ...c, stayInTouchDays: own, targetSource: 'orbit' as const };
		return { ...c, targetSource: c.stayInTouchDays ? ('monica' as const) : null };
	});
}

/** Set (days > 0) or clear (empty / 0) one contact's target. */
export function setCatchupTarget(db: OrbitDb, contactId: number, form: FormData, now = new Date()): { ok: boolean; message: string } {
	const raw = form.get('clear') ? '' : String(form.get('days') ?? '').trim();
	const parsed = z.coerce.number().int().min(0).max(MAX_TARGET_DAYS).safeParse(raw === '' ? 0 : raw);
	if (!parsed.success) return { ok: false, message: `Pick a number of days (1 to ${MAX_TARGET_DAYS}).` };
	const days = parsed.data || null;
	db.insert(contactMeta)
		.values({ monicaContactId: contactId, catchupIntervalDays: days, updatedAt: now.toISOString() })
		.onConflictDoUpdate({ target: contactMeta.monicaContactId, set: { catchupIntervalDays: days, updatedAt: now.toISOString() } })
		.run();
	return { ok: true, message: days ? `Catch-up target set: every ${describeDays(days)}.` : 'Catch-up target cleared.' };
}

export function catchupTarget(db: OrbitDb, contactId: number): number | null {
	return db.select().from(contactMeta).where(eq(contactMeta.monicaContactId, contactId)).get()?.catchupIntervalDays ?? null;
}

/** "3 weeks", "2 months", "10 days". */
export function describeDays(d: number): string {
	if (d % 30 === 0) return d === 30 ? 'month' : `${d / 30} months`;
	if (d % 7 === 0) return d === 7 ? 'week' : `${d / 7} weeks`;
	return d === 1 ? 'day' : `${d} days`;
}
