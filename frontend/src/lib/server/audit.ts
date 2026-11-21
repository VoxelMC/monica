import { desc, eq } from 'drizzle-orm';
import type { OrbitDb } from './db';
import { auditLog } from './db/schema';

export interface AuditStart {
	method: string;
	endpoint: string;
	monicaId?: number | null;
	before?: unknown;
	after?: unknown; // for a pending write: the payload about to be sent
	dryRun: boolean;
	result: string;
}

export interface AuditLog {
	/** Insert a row and return its id. */
	start(entry: AuditStart): number;
	/** Set the final result (and the after JSON) of a row. */
	finish(id: number, result: string, after?: unknown): void;
}

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

export function createAuditLog(db: OrbitDb, now: () => Date = () => new Date()): AuditLog {
	return {
		start(e) {
			const row = db
				.insert(auditLog)
				.values({
					at: now().toISOString(),
					method: e.method,
					endpoint: e.endpoint,
					monicaId: e.monicaId ?? null,
					beforeJson: json(e.before),
					afterJson: json(e.after),
					dryRun: e.dryRun,
					result: e.result
				})
				.returning({ id: auditLog.id })
				.get();
			return row.id;
		},
		finish(id, result, after) {
			db.update(auditLog)
				.set(after === undefined ? { result } : { result, afterJson: json(after) })
				.where(eq(auditLog.id, id))
				.run();
		}
	};
}

export function recentAudit(db: OrbitDb, limit = 50) {
	return db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit).all();
}
