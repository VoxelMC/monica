// App-wide Monica client and guards, built from the environment.
import { dev } from '$app/env';
import { MONICA_TOKEN, MONICA_URL, ORBIT_DB_PATH, ORBIT_DRY_RUN, ORBIT_READ_ONLY } from '$app/env/private';
import { createAuditLog } from '../audit';
import { assertDevTargetsStaging } from '../config';
import { openDb, type OrbitDb } from '../db';
import { createMonicaClient, createTransport, type MonicaClient } from './client';
import { createGuards, type Guards } from './guards';

assertDevTargetsStaging(MONICA_URL, dev);

const transport = createTransport({
	baseUrl: MONICA_URL,
	token: MONICA_TOKEN,
	readOnly: ORBIT_READ_ONLY
});

export const monica: MonicaClient = createMonicaClient(transport, { cacheTtlMs: 60_000 });

export const settings = {
	monicaUrl: MONICA_URL,
	readOnly: ORBIT_READ_ONLY,
	dryRun: ORBIT_DRY_RUN,
	dbPath: ORBIT_DB_PATH
} as const;

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
