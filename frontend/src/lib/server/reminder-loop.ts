// Every 30 seconds, send reminders that are due. Started once from
// hooks.server.ts. If orbit was down, overdue reminders go out when it starts,
// marked "late". A failed send is retried with growing pauses.
import type { OrbitDb } from './db';
import type { Notification } from './ntfy';
import { dueToSend, notificationFor, recordFailure, recordSent } from './reminders';

export interface LoopOptions {
	db: () => OrbitDb;
	/** null when ntfy is not configured: nothing is sent, reminders wait. */
	send: ((n: Notification) => Promise<void>) | null;
	publicUrl?: string;
	now?: () => Date;
}

/** One pass: send everything due. Returns how many were sent. */
export async function tick(opts: LoopOptions): Promise<number> {
	if (!opts.send) return 0;
	const now = opts.now ?? (() => new Date());
	const db = opts.db();
	let sent = 0;
	for (const r of dueToSend(db, now())) {
		try {
			await opts.send(notificationFor(r, opts.publicUrl, now()));
			recordSent(db, r.id, now());
			sent++;
		} catch (err) {
			recordFailure(db, r, err instanceof Error ? err.message : String(err), now());
			console.error(`reminder ${r.id}: send failed:`, err instanceof Error ? err.message : err);
		}
	}
	return sent;
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startReminderLoop(opts: LoopOptions, intervalMs = 30_000): void {
	if (timer) return;
	let running = false;
	const run = async () => {
		if (running) return; // a slow ntfy never causes double sends
		running = true;
		try {
			await tick(opts);
		} catch (err) {
			console.error('reminder loop:', err instanceof Error ? err.message : err);
		} finally {
			running = false;
		}
	};
	timer = setInterval(run, intervalMs);
	timer.unref?.();
	void run();
}
