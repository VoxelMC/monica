import { defineEnvVars } from '@sveltejs/kit/env';
import {
	parseDryRun,
	parseMonicaUrlOptional,
	parsePublicUrl,
	parseReadOnly,
	parseRpm,
	parseTokenOptional
} from './lib/server/config';
import { parseNtfyUrl } from './lib/server/ntfy';

// All variables are private (server-only) and read when the app starts.
export const variables = defineEnvVars({
	MONICA_URL: {
		schema: parseMonicaUrlOptional,
		description: 'Monica origin. Staging (http://127.0.0.1:8081) in dev; http://127.0.0.1:80 in production.'
	},
	MONICA_PUBLIC_URL: {
		schema: parsePublicUrl,
		description: 'Optional. Monica as the browser sees it (e.g. https://monica.trevfox.dev), for "Open in Monica" links.'
	},
	MONICA_TOKEN: {
		schema: parseTokenOptional,
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
	ORBIT_MONICA_RPM: {
		schema: parseRpm,
		description: "Default 50. Monica API requests per minute orbit allows itself; keep below Monica's RATE_LIMIT_PER_MINUTE_API."
	},
	ORBIT_NTFY_URL: {
		schema: parseNtfyUrl,
		description: 'Optional. ntfy topic URL for reminder notifications, e.g. https://ntfy.sh/<secret-topic>. Unset: reminders are kept but not sent.'
	},
	ORBIT_NTFY_TOKEN: {
		schema: (v) => (v && v.trim() ? v.trim() : undefined),
		description: 'Optional. ntfy access token, if the topic is protected. Never logged.'
	},
	ORBIT_PUBLIC_URL: {
		schema: parsePublicUrl,
		description: 'Optional. orbit as the browser sees it (e.g. https://orbit.trevfox.dev); tapping a reminder opens the contact there.'
	},
	ORBIT_DB_PATH: {
		schema: (v) => (v && v.trim() ? v.trim() : './data/orbit.sqlite'),
		description: 'Extension DB (SQLite) file path.'
	}
});
