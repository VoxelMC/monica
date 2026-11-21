// Test-only helpers: a scripted fake fetch and a fake clock.
import { resolve } from 'node:path';
import { createAuditLog } from '../audit';
import { openDb } from '../db';

export interface Call {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

/** fetch that answers from a queue (or a function) and records every call. */
export function fakeFetch(replies: Reply[] | ((call: Call) => Reply)) {
	const calls: Call[] = [];
	const impl = async (input: string | URL | Request, init?: RequestInit) => {
		const call: Call = {
			url: String(input),
			method: init?.method ?? 'GET',
			headers: (init?.headers ?? {}) as Record<string, string>,
			body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
		};
		calls.push(call);
		const reply = typeof replies === 'function' ? replies(call) : replies.shift();
		if (!reply) throw new Error(`fakeFetch: no reply queued for ${call.method} ${call.url}`);
		if (reply instanceof Error) throw reply;
		const body = reply.body === undefined ? '' : JSON.stringify(reply.body);
		return new Response(body, { status: reply.status ?? 200, headers: reply.headers });
	};
	return { fetch: impl as typeof fetch, calls };
}

/** Clock whose sleep() advances time instantly. */
export function fakeClock(start = 1_700_000_000_000) {
	let t = start;
	const sleeps: number[] = [];
	return {
		now: () => t,
		sleep: async (ms: number) => {
			sleeps.push(ms);
			t += ms;
		},
		sleeps
	};
}

export function memoryAudit() {
	const db = openDb(':memory:', resolve(import.meta.dirname, '../../../../drizzle'));
	return { db, audit: createAuditLog(db) };
}

export function page<T>(data: T[], current: number, last: number) {
	return {
		data,
		// Deliberately wrong host: the client must never follow these.
		links: { next: current < last ? `http://evil.example/api/x?page=${current + 1}` : null },
		meta: { current_page: current, last_page: last, per_page: data.length, total: data.length * last }
	};
}
