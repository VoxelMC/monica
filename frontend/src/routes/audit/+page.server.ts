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
		before: r.beforeJson ? pretty(r.beforeJson) : null,
		after: r.afterJson ? pretty(r.afterJson) : null,
		// Photo uploads: show the image itself instead of its base64 text
		image: r.afterJson ? firstImage(r.afterJson) : null
	}));
	return { rows, readOnly: settings.readOnly, dryRun: settings.dryRun };
};

const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

/** JSON for display, with long image data shortened to its type and size. */
function pretty(json: string): string {
	return JSON.stringify(
		JSON.parse(json),
		(_k, v) => (typeof v === 'string' && v.length > 200 && IMAGE.test(v) ? `${v.slice(0, v.indexOf(',') + 1)}… (${Math.round((v.length * 0.75) / 1000)} KB image)` : v),
		2
	);
}

function firstImage(json: string): string | null {
	const m = /"(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)"/.exec(json);
	return m ? m[1] : null;
}
