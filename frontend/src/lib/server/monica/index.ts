// App-wide Monica client and guards, built from the environment.
import { building, dev } from '$app/env';
import { MONICA_PUBLIC_URL, MONICA_TOKEN as TOKEN_ENV, MONICA_URL as URL_ENV, ORBIT_DB_PATH, ORBIT_DRY_RUN, ORBIT_MONICA_RPM, ORBIT_NTFY_TOKEN, ORBIT_NTFY_URL, ORBIT_PUBLIC_URL, ORBIT_READ_ONLY } from '$app/env/private';
import { createAuditLog } from '../audit';
import { assertDevTargetsStaging, requireAtRuntime } from '../config';
import { openDb, type OrbitDb } from '../db';
import { createMonicaClient, createTransport, type MonicaClient } from './client';
import { createGuards, type Guards } from './guards';

// Placeholders only while `vite build` analyses routes; nothing is fetched then.
const MONICA_URL = requireAtRuntime('MONICA_URL', URL_ENV, building) ?? 'http://127.0.0.1:9';
const MONICA_TOKEN = requireAtRuntime('MONICA_TOKEN', TOKEN_ENV, building) ?? 'unset-at-build-time';

if (!building) assertDevTargetsStaging(MONICA_URL, dev);

const transport = createTransport({
	baseUrl: MONICA_URL,
	token: MONICA_TOKEN,
	readOnly: ORBIT_READ_ONLY,
	requestsPerMinute: ORBIT_MONICA_RPM
});

// Answers under a minute old are used as they are. Older ones (up to a day) are
// shown straight away while orbit asks Monica again in the background; the page
// then refreshes itself if anything changed (see /fresh and CacheSync.svelte).
// A write clears everything, so the page after a save always waits for Monica.
export const monica: MonicaClient = createMonicaClient(transport, {
	cacheTtlMs: 60_000,
	staleMs: 24 * 60 * 60_000,
	onRevalidateError: (path, err) => console.warn(`background re-check of ${path} failed:`, err instanceof Error ? err.message : err)
});

/** Fill the cache when the server starts, so the first visit after a restart is quick. */
export async function warmCache(): Promise<void> {
	const [{ listContacts, listOpenTasks, listTagNames }, { loadDiary }] = await Promise.all([import('./contacts'), import('./diary')]);
	const t = Date.now();
	const results = await Promise.allSettled([listContacts(monica), listOpenTasks(monica), listTagNames(monica), loadDiary(monica)]);
	const failed = results.filter((r) => r.status === 'rejected').length;
	console.log(`cache warm-up: ${results.length - failed}/${results.length} lists loaded in ${Date.now() - t} ms`);
}

export const settings = {
	monicaUrl: MONICA_URL,
	/** Browser-facing Monica origin; in dev, staging is reachable through the SSH tunnel. */
	publicMonicaUrl: MONICA_PUBLIC_URL ?? (dev ? MONICA_URL : undefined),
	readOnly: ORBIT_READ_ONLY,
	dryRun: ORBIT_DRY_RUN,
	dbPath: ORBIT_DB_PATH,
	/** Reminder notifications go out only when this is set. */
	ntfyConfigured: ORBIT_NTFY_URL !== undefined,
	ntfyServer: ORBIT_NTFY_URL?.server,
	publicUrl: ORBIT_PUBLIC_URL
} as const;

/** Reminder sending settings (hooks.server.ts starts the loop). */
export const ntfy = ORBIT_NTFY_URL ? { ...ORBIT_NTFY_URL, token: ORBIT_NTFY_TOKEN } : undefined;

let db: OrbitDb | undefined;
export function getDb(): OrbitDb {
	db ??= openDb(ORBIT_DB_PATH);
	return db;
}

let guards: Guards | undefined;
/** The only way to write to Monica. */
export function getGuards(): Guards {
	guards ??= createGuards({
		transport,
		readOnly: ORBIT_READ_ONLY,
		dryRun: ORBIT_DRY_RUN,
		audit: createAuditLog(getDb()),
		onWrite: () => monica.invalidate()
	});
	return guards;
}
