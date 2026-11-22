import type { z } from 'zod';

/** Base class. Messages never contain the token or request headers. */
export class MonicaError extends Error {
	constructor(
		message: string,
		readonly method: string,
		readonly path: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'MonicaError';
	}
}

/** Monica answered, but not with 2xx. */
export class MonicaHttpError extends MonicaError {
	constructor(method: string, path: string, status: number) {
		super(`Monica ${method} ${path} failed with HTTP ${status}`, method, path, status);
		this.name = 'MonicaHttpError';
	}
}

/** Still rate limited after all retries. */
export class MonicaRateLimitError extends MonicaError {
	constructor(method: string, path: string) {
		super(`Monica is busy (too many requests this minute) for ${method} ${path}`, method, path, 429);
		this.name = 'MonicaRateLimitError';
	}
}

/** Monica's response did not match the expected Zod schema. */
export class MonicaValidationError extends MonicaError {
	constructor(
		method: string,
		path: string,
		readonly issues: z.core.$ZodIssue[]
	) {
		const summary = issues
			.slice(0, 5)
			.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
			.join('; ');
		super(`Unexpected response from Monica ${method} ${path}: ${summary}`, method, path);
		this.name = 'MonicaValidationError';
	}
}

/** A write was refused by orbit before anything was sent. */
export class WriteRefusedError extends Error {
	constructor(
		readonly reason: 'read-only' | 'delete-forbidden' | 'not-allowlisted' | 'field-not-editable' | 'bad-path' | 'invalid-body' | 'precondition',
		message: string
	) {
		super(message);
		this.name = 'WriteRefusedError';
	}
}

/** The record changed in Monica since the UI loaded it. */
export class ConflictError extends Error {
	constructor(
		readonly path: string,
		readonly expectedUpdatedAt: string,
		readonly actualUpdatedAt: unknown
	) {
		super(`Conflict on ${path}: it was changed in Monica since you loaded it`);
		this.name = 'ConflictError';
	}
}

/** What to tell the person when a page cannot load from Monica. */
export function loadErrorMessage(err: unknown, what: string): string {
	if (err instanceof MonicaRateLimitError) return 'Monica is busy right now (too many requests this minute). Try again in a few seconds.';
	if (err instanceof MonicaError) return `Could not load ${what} from Monica.`;
	return `Could not load ${what}.`;
}
