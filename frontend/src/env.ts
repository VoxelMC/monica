import { defineEnvVars } from '@sveltejs/kit/env';
import {
	parseDryRun,
	parseMonicaUrl,
	parseReadOnly,
	parseToken
} from './lib/server/config';

// All variables are private (server-only) and read when the app starts.
export const variables = defineEnvVars({
	MONICA_URL: {
		schema: parseMonicaUrl,
		description: 'Monica origin. Staging (http://127.0.0.1:8081) in dev; http://127.0.0.1:80 in production.'
	},
	MONICA_TOKEN: {
		schema: parseToken,
		description: 'Monica personal access token. Server-side only; never log it.'
	},
	ORBIT_READ_ONLY: {
		schema: parseReadOnly,
		description: 'Default true. Refuses every non-GET request to Monica.'
	},
	ORBIT_DRY_RUN: {
		schema: parseDryRun,
		description: 'Default false. Log writes to the audit log instead of sending them.'
	},
	ORBIT_DB_PATH: {
		schema: (v) => (v && v.trim() ? v.trim() : './data/orbit.sqlite'),
		description: 'Extension DB (SQLite) file path.'
	}
});
