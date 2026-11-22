// Monica REST client: auth header, pagination by page number, rate limiting,
// 429/Retry-After handling, short-lived GET cache and Zod validation.
//
// Two layers:
//  - createTransport(): raw HTTP. Refuses DELETE always and non-GET while read-only.
//    Only guards.ts may use it for writes.
//  - createMonicaClient(): the read API the rest of the app uses. GET only.

import type { z } from 'zod';
import {
	MonicaError,
	MonicaHttpError,
	MonicaRateLimitError,
	MonicaValidationError,
	WriteRefusedError
} from './errors';
import { paginated, type paginationMeta } from './schemas';

export type Method = 'GET' | 'POST' | 'PUT';
export type Query = Record<string, string | number | boolean | undefined>;

export interface TransportOptions {
	baseUrl: string; // origin only, e.g. http://127.0.0.1:8081
	token: string;
	readOnly: boolean;
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Requests allowed per rolling minute. Monica's default is 60; stay below it. */
	requestsPerMinute?: number;
	/** Retries after a 429 (and, for GET only, after network errors / 502-504). */
	maxRetries?: number;
	/**
	 * Longest time a request may wait for the per-minute budget (or a 429's
	 * Retry-After) before failing with MonicaRateLimitError instead of hanging.
	 */
	maxWaitMs?: number;
}

export interface Transport {
	request(method: Method, path: string, opts?: { query?: Query; body?: unknown }): Promise<unknown>;
	readonly readOnly: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Path must be a relative Monica API path. Rejects absolute URLs (e.g. from `links`) and traversal. */
export function assertApiPath(path: string): void {
	if (
		!path.startsWith('/api/') ||
		path.includes('://') ||
		path.includes('?') ||
		path.includes('#') ||
		path.split('/').some((seg) => seg === '..' || seg === '.')
	) {
		throw new WriteRefusedError('bad-path', `Invalid Monica API path: ${path}`);
	}
}

function buildUrl(baseUrl: string, path: string, query?: Query): string {
	const url = new URL(path, baseUrl);
	if (url.origin !== new URL(baseUrl).origin) throw new WriteRefusedError('bad-path', 'Path escapes MONICA_URL');
	for (const [k, v] of Object.entries(query ?? {})) {
		if (v !== undefined) url.searchParams.set(k, String(v));
	}
	return url.toString();
}

/** Parse Retry-After (seconds or HTTP date) into ms. Falls back to 60 s, capped at 120 s. */
export function retryAfterMs(header: string | null, now: number): number {
	const fallback = 60_000;
	if (!header) return fallback;
	const secs = Number(header);
	let ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
	if (!Number.isFinite(ms) || ms < 0) ms = fallback;
	return Math.min(Math.max(ms, 1000), 120_000);
}

/** Rolling-window limiter; requests wait in FIFO order, but never longer than maxWaitMs. */
function createLimiter(perMinute: number, maxWaitMs: number, sleep: (ms: number) => Promise<void>, now: () => number) {
	const sent: number[] = [];
	let chain: Promise<void> = Promise.resolve();
	return function acquire(onTooLong: () => Error): Promise<void> {
		const next = chain.then(async () => {
			for (;;) {
				const t = now();
				while (sent.length && t - sent[0] >= 60_000) sent.shift();
				if (sent.length < perMinute) {
					sent.push(t);
					return;
				}
				const wait = 60_000 - (t - sent[0]);
				if (wait > maxWaitMs) throw onTooLong();
				await sleep(wait);
			}
		});
		chain = next.catch(() => {});
		return next;
	};
}

export function createTransport(opts: TransportOptions): Transport {
	const doFetch = opts.fetch ?? fetch;
	const sleep = opts.sleep ?? defaultSleep;
	const now = opts.now ?? Date.now;
	const maxRetries = opts.maxRetries ?? 3;
	const maxWaitMs = opts.maxWaitMs ?? 8_000;
	const acquire = createLimiter(opts.requestsPerMinute ?? 50, maxWaitMs, sleep, now);
	const baseUrl = opts.baseUrl;
	const token = opts.token;

	async function request(method: Method, path: string, ro: { query?: Query; body?: unknown } = {}) {
		// Defence in depth: these are also checked in guards.ts.
		if ((method as string).toUpperCase() === 'DELETE') {
			throw new WriteRefusedError('delete-forbidden', 'DELETE requests to Monica are never sent');
		}
		if (method !== 'GET' && method !== 'POST' && method !== 'PUT') {
			throw new WriteRefusedError('not-allowlisted', `HTTP method ${method} is not allowed`);
		}
		if (method !== 'GET' && opts.readOnly) {
			throw new WriteRefusedError('read-only', `orbit is read-only (ORBIT_READ_ONLY=true): ${method} ${path} refused`);
		}
		assertApiPath(path);
		const url = buildUrl(baseUrl, path, ro.query);

		for (let attempt = 0; ; attempt++) {
			await acquire(() => new MonicaRateLimitError(method, path));
			let res: Response;
			try {
				res = await doFetch(url, {
					method,
					redirect: 'manual', // never follow a redirect with the token attached
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/json',
						...(ro.body !== undefined ? { 'Content-Type': 'application/json' } : {})
					},
					body: ro.body !== undefined ? JSON.stringify(ro.body) : undefined
				});
			} catch (err) {
				// Network error: retry only reads; a write may or may not have reached Monica.
				if (method === 'GET' && attempt < maxRetries) {
					await sleep(500 * 2 ** attempt);
					continue;
				}
				throw new MonicaError(
					`Could not reach Monica for ${method} ${path}: ${(err as Error)?.message ?? 'network error'}`,
					method,
					path
				);
			}

			if (res.status === 429) {
				// 429 means Monica did not process the request, so retrying is safe for writes too.
				const wait = retryAfterMs(res.headers.get('Retry-After'), now());
				if (attempt < maxRetries && wait <= maxWaitMs) {
					await sleep(wait);
					continue;
				}
				throw new MonicaRateLimitError(method, path);
			}
			if (method === 'GET' && [502, 503, 504].includes(res.status) && attempt < maxRetries) {
				await sleep(500 * 2 ** attempt);
				continue;
			}
			if (!res.ok) throw new MonicaHttpError(method, path, res.status);

			const text = await res.text();
			if (text === '') return null;
			try {
				return JSON.parse(text) as unknown;
			} catch {
				throw new MonicaError(`Monica ${method} ${path} returned non-JSON`, method, path, res.status);
			}
		}
	}

	return { request, readOnly: opts.readOnly };
}

export function validate<T extends z.ZodType>(schema: T, data: unknown, method: string, path: string): z.infer<T> {
	const result = schema.safeParse(data);
	if (!result.success) throw new MonicaValidationError(method, path, result.error.issues);
	return result.data;
}

export interface MonicaClient {
	/** GET one resource and validate it. */
	get<T extends z.ZodType>(path: string, schema: T, query?: Query): Promise<z.infer<T>>;
	/** GET every page of a list endpoint (page=1..meta.last_page) and return all items. */
	getAll<T extends z.ZodType>(path: string, item: T, query?: Query): Promise<z.infer<T>[]>;
	/** Drop cached GET responses (call after a write). */
	invalidate(): void;
}

export interface ClientOptions {
	cacheTtlMs?: number;
	now?: () => number;
	/** Safety cap on pages walked by getAll. */
	maxPages?: number;
}

export function createMonicaClient(transport: Transport, opts: ClientOptions = {}): MonicaClient {
	const ttl = opts.cacheTtlMs ?? 30_000;
	const now = opts.now ?? Date.now;
	const maxPages = opts.maxPages ?? 1000;
	const cache = new Map<string, { at: number; value: Promise<unknown> }>();

	function cachedGet(path: string, query?: Query): Promise<unknown> {
		const key = path + '?' + new URLSearchParams(
			Object.entries(query ?? {})
				.filter(([, v]) => v !== undefined)
				.map(([k, v]) => [k, String(v)] as [string, string])
				.sort(([a], [b]) => a.localeCompare(b))
		).toString();
		const hit = cache.get(key);
		if (ttl > 0 && hit && now() - hit.at < ttl) return hit.value;
		const value = transport.request('GET', path, { query });
		if (ttl > 0) {
			cache.set(key, { at: now(), value });
			value.catch(() => cache.delete(key));
		}
		return value;
	}

	return {
		async get(path, schema, query) {
			return validate(schema, await cachedGet(path, query), 'GET', path);
		},

		async getAll(path, item, query = {}) {
			if ('page' in query) throw new Error('getAll manages ?page= itself');
			const pageSchema = paginated(item);
			const items: unknown[] = [];
			let lastPage = 1;
			for (let page = 1; page <= lastPage; page++) {
				if (page > maxPages) throw new MonicaError(`getAll ${path}: more than ${maxPages} pages`, 'GET', path);
				const raw = await cachedGet(path, { limit: 100, ...query, page });
				const parsed = validate(pageSchema, raw, 'GET', path) as {
					data: unknown[];
					meta: z.infer<typeof paginationMeta>;
				};
				items.push(...parsed.data);
				// Walk by page number only; `links` URLs are built from Monica's view of the host.
				lastPage = parsed.meta.last_page;
			}
			return items as z.infer<typeof item>[];
		},

		invalidate() {
			cache.clear();
		}
	};
}
