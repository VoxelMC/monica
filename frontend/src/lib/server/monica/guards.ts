// Every write to Monica goes through this module. Rules (SPEC "Write guards"):
//  1. DELETE is never sent.
//  2. Read-only switch: ORBIT_READ_ONLY=true refuses every write (it wins over dry run).
//  3. Allowlist: only method + path patterns listed in WRITE_ALLOWLIST are allowed,
//     and only the fields each rule lists may be changed.
//  4. Fetch, merge, then send: updates GET the current record, change only the
//     edited fields, and send the whole object back (Monica's PUT replaces records).
//  5. Conflict check: the record's updated_at must equal the value the UI showed.
//  6. Dry run: ORBIT_DRY_RUN=true records what would be sent and sends nothing.
//  7. Audit log: a row is written BEFORE anything is sent; if it cannot be written,
//     nothing is sent.

import type { AuditLog } from '../audit';
import { assertApiPath, type Transport } from './client';
import { ConflictError, WriteRefusedError } from './errors';

type Json = Record<string, unknown>;

export interface WriteRule {
	/** Stable name used by callers, e.g. 'contact.update'. */
	key: string;
	method: 'POST' | 'PUT';
	/** Path template with a single {id} for PUT rules, e.g. '/api/notes/{id}'. */
	path: string;
	/** Fields a caller may set. Anything else is refused. */
	editableFields: readonly string[];
	/**
	 * PUT only: turn the record as returned by GET into a full PUT payload
	 * (Monica's input format differs from its output, e.g. gender -> gender_id).
	 */
	toPayload?: (current: Json) => Json;
	/** PUT only: where to GET the current record. Defaults to `path`. */
	readPath?: string;
}

/**
 * The write allowlist. EMPTY until slice 4 is approved by the owner.
 * Before adding an entry: write its guard test, run it on staging, show the owner
 * the audit log before/after JSON, and wait for approval (frontend/CLAUDE.md).
 */
export const WRITE_ALLOWLIST: readonly WriteRule[] = [];

export interface GuardOptions {
	transport: Transport;
	readOnly: boolean;
	dryRun: boolean;
	audit: AuditLog;
	allowlist?: readonly WriteRule[];
	/** Called after a successful write (e.g. to clear the GET cache). */
	onWrite?: () => void;
}

export interface WriteResult {
	auditId: number;
	dryRun: boolean;
	/** What was (or, in dry run, would have been) sent. */
	payload: Json;
	/** Monica's response; null in dry run. */
	response: unknown;
}

export interface Guards {
	create(key: string, body: Json): Promise<WriteResult>;
	update(key: string, id: number, changes: Json, expectedUpdatedAt: string): Promise<WriteResult>;
}

/** Check a method and path against the read-only switch and allowlist. Throws if refused. */
export function checkWrite(
	method: string,
	path: string,
	opts: { readOnly: boolean; allowlist: readonly WriteRule[] }
): WriteRule {
	const m = method.toUpperCase();
	if (m === 'DELETE') throw new WriteRefusedError('delete-forbidden', 'DELETE requests to Monica are never sent');
	if (m === 'GET') throw new WriteRefusedError('not-allowlisted', 'GET is not a write');
	if (opts.readOnly) {
		throw new WriteRefusedError('read-only', `orbit is read-only (ORBIT_READ_ONLY=true): ${m} ${path} refused`);
	}
	assertApiPath(path);
	const rule = opts.allowlist.find((r) => r.method === m && matchPath(r.path, path));
	if (!rule) throw new WriteRefusedError('not-allowlisted', `${m} ${path} is not on the write allowlist`);
	return rule;
}

function matchPath(template: string, path: string): boolean {
	const re = new RegExp('^' + template.split('{id}').map(escapeRe).join('\\d+') + '$');
	return re.test(path);
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function assertFields(rule: WriteRule, fields: Json) {
	const bad = Object.keys(fields).filter((f) => !rule.editableFields.includes(f));
	if (bad.length) {
		throw new WriteRefusedError('field-not-editable', `${rule.key}: field(s) not editable: ${bad.join(', ')}`);
	}
}

function unwrap(body: unknown): Json {
	if (body && typeof body === 'object' && 'data' in body && body.data && typeof body.data === 'object') {
		return body.data as Json;
	}
	throw new Error('Monica response has no `data` object');
}

export function createGuards(opts: GuardOptions): Guards {
	const allowlist = opts.allowlist ?? WRITE_ALLOWLIST;
	const { transport, audit } = opts;

	/** Run checks, logging a refusal to the audit log before rethrowing. */
	function guarded<T>(method: string, path: string, monicaId: number | null, fn: () => T): T {
		try {
			return fn();
		} catch (err) {
			if (err instanceof WriteRefusedError) {
				audit.start({ method, endpoint: path, monicaId, dryRun: opts.dryRun, result: `refused:${err.reason}` });
			}
			throw err;
		}
	}

	/**
	 * Find the rule and run every pre-send check (read-only, allowlist, fields).
	 * Refusals are written to the audit log, then rethrown.
	 */
	function precheck(method: 'POST' | 'PUT', key: string, id: number | null, fields: Json) {
		const rule = allowlist.find((r) => r.key === key && r.method === method);
		const path = rule ? rule.path.replace('{id}', String(id)) : `(no rule "${key}")`;
		guarded(method, path, id, () => {
			if (!rule) {
				if (opts.readOnly) checkWrite(method, path, { readOnly: true, allowlist });
				throw new WriteRefusedError('not-allowlisted', `No ${method} rule "${key}" on the write allowlist`);
			}
			checkWrite(method, path, { readOnly: opts.readOnly, allowlist });
			assertFields(rule, fields);
			if (method === 'PUT' && !rule.toPayload) {
				throw new WriteRefusedError('not-allowlisted', `${rule.key} has no toPayload mapping`);
			}
		});
		return { rule: rule!, path };
	}

	async function send(
		method: 'POST' | 'PUT',
		path: string,
		monicaId: number | null,
		before: unknown,
		payload: Json
	): Promise<WriteResult> {
		if (opts.dryRun) {
			const auditId = audit.start({ method, endpoint: path, monicaId, before, after: payload, dryRun: true, result: 'dry-run' });
			return { auditId, dryRun: true, payload, response: null };
		}
		// Pending row first: if this throws, nothing is sent.
		const auditId = audit.start({ method, endpoint: path, monicaId, before, after: payload, dryRun: false, result: 'pending' });
		let response: unknown;
		try {
			response = await transport.request(method, path, { body: payload });
		} catch (err) {
			audit.finish(auditId, `error:${(err as Error).message}`);
			throw err;
		}
		audit.finish(auditId, 'ok', response);
		opts.onWrite?.();
		return { auditId, dryRun: false, payload, response };
	}

	return {
		async create(key, body) {
			const { path } = precheck('POST', key, null, body);
			return send('POST', path, null, null, { ...body });
		},

		async update(key, id, changes, expectedUpdatedAt) {
			if (!Number.isInteger(id) || id <= 0) throw new WriteRefusedError('bad-path', `Invalid id ${id}`);
			const { rule, path } = precheck('PUT', key, id, changes);

			// Fetch: always fresh from Monica (transport, not the cached client).
			const readPath = (rule.readPath ?? rule.path).replace('{id}', String(id));
			const current = unwrap(await transport.request('GET', readPath));

			// Conflict check.
			if (current.updated_at !== expectedUpdatedAt) {
				audit.start({ method: 'PUT', endpoint: path, monicaId: id, before: current, dryRun: opts.dryRun, result: 'conflict' });
				throw new ConflictError(path, expectedUpdatedAt, current.updated_at);
			}

			// Merge: full payload from the current record, then only the edited fields.
			const payload = { ...rule.toPayload!(current), ...changes };
			return send('PUT', path, id, current, payload);
		}
	};
}
