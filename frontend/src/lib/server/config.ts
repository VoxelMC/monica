// Pure parsers for orbit's environment variables. Kept free of SvelteKit imports
// so they can be unit-tested; src/env.ts wires them into $app/env/private.

/**
 * Parse a boolean flag strictly. Anything other than "true"/"false" (or unset)
 * is a configuration error: a typo must never silently disable a safety switch.
 */
export function parseFlag(name: string, value: string | undefined, fallback: boolean): boolean {
	if (value === undefined || value.trim() === '') return fallback;
	const v = value.trim().toLowerCase();
	if (v === 'true') return true;
	if (v === 'false') return false;
	throw new Error(`${name} must be "true" or "false", got "${value}"`);
}

/** ORBIT_READ_ONLY: defaults to true. Only an explicit "false" enables writes. */
export const parseReadOnly = (value: string | undefined) => parseFlag('ORBIT_READ_ONLY', value, true);

/** ORBIT_DRY_RUN: defaults to false (per SPEC). */
export const parseDryRun = (value: string | undefined) => parseFlag('ORBIT_DRY_RUN', value, false);

/** MONICA_URL: an http(s) origin with no path, query or credentials. Returns the origin. */
export function parseMonicaUrl(value: string | undefined): string {
	if (!value) throw new Error('MONICA_URL is not set');
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('MONICA_URL is not a valid URL');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error('MONICA_URL must use http or https');
	}
	if (url.username || url.password) throw new Error('MONICA_URL must not contain credentials');
	if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
		throw new Error('MONICA_URL must be an origin only, e.g. http://127.0.0.1:8081');
	}
	return url.origin;
}

/** The only Monica origins the dev server may talk to (staging). */
export const STAGING_ORIGINS = ['http://127.0.0.1:8081', 'http://localhost:8081'];

/** In dev, refuse anything that is not staging, so a pasted production URL cannot be used. */
export function assertDevTargetsStaging(origin: string, isDev: boolean): void {
	if (isDev && !STAGING_ORIGINS.includes(origin)) {
		throw new Error(
			`Refusing to start: in dev, MONICA_URL must be staging (${STAGING_ORIGINS[0]}), got ${origin}`
		);
	}
}

export function parseToken(value: string | undefined): string {
	if (!value || value.trim() === '') throw new Error('MONICA_TOKEN is not set');
	return value.trim();
}

/** MONICA_PUBLIC_URL: optional browser-facing Monica origin for "Open in Monica" links. */
export function parsePublicUrl(value: string | undefined): string | undefined {
	if (!value || value.trim() === '') return undefined;
	return parseMonicaUrl(value.trim());
}
