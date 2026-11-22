import { recentAudit } from '#lib/server/audit.js';
import { getDb, settings } from '#lib/server/monica/index.js';
import type { PageServerLoad } from './$types';

// The write audit log (orbit's own database): every write sent, refused or dry-run.
export const load: PageServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const rows = recentAudit(getDb(), 100).map((r) => ({
		id: r.id,
		at: r.at,
		method: r.method,
		endpoint: r.endpoint,
		monicaId: r.monicaId,
		dryRun: r.dryRun,
		result: r.result,
		before: r.beforeJson ? JSON.stringify(JSON.parse(r.beforeJson), null, 2) : null,
		after: r.afterJson ? JSON.stringify(JSON.parse(r.afterJson), null, 2) : null
	}));
	return { rows, readOnly: settings.readOnly, dryRun: settings.dryRun };
};
