import { count } from 'drizzle-orm';
import { auditLog } from '#lib/server/db/schema.js';
import { getDb, monica, settings } from '#lib/server/monica/index.js';
import { MonicaError } from '#lib/server/monica/errors.js';
import { single, user } from '#lib/server/monica/schemas.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const started = Date.now();
	let me: { ok: true; name: string; email: string; accountId: number; timezone: string | null; ms: number } | { ok: false; error: string };
	try {
		const res = await monica.get('/api/me', single(user));
		me = {
			ok: true,
			name: res.data.name,
			email: res.data.email,
			accountId: res.data.account.id,
			timezone: res.data.timezone,
			ms: Date.now() - started
		};
	} catch (err) {
		me = { ok: false, error: err instanceof MonicaError ? err.message : 'Unexpected error calling Monica' };
	}

	let db: { ok: true; auditRows: number } | { ok: false; error: string };
	try {
		const row = getDb().select({ n: count() }).from(auditLog).get();
		db = { ok: true, auditRows: row?.n ?? 0 };
	} catch (err) {
		db = { ok: false, error: err instanceof Error ? err.message : String(err) };
	}

	return {
		me,
		db,
		settings: {
			monicaUrl: settings.monicaUrl,
			readOnly: settings.readOnly,
			dryRun: settings.dryRun
		}
	};
};
