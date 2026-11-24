// Every write to Monica goes through this module. Rules (SPEC "Write guards"):
//  1. DELETE only for hangouts, notes and journal entries (owner decision 2026-11-23):
//     allowlisted path, full record saved to the audit log first, conflict check.
//     The transport refuses every other DELETE, and contacts can never be deleted.
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
import { basePayloadFromContact, contactHasBirthday } from '../../birthday-write';
import { checkPhotoDataUrl } from '../../photo';
import { DELETE_CAPABILITY } from './delete-capability';
import { ConflictError, WriteRefusedError } from './errors';

export { DELETE_CAPABILITY };

type Json = Record<string, unknown>;

export interface WriteRule {
	/** Stable name used by callers, e.g. 'contact.update'. */
	key: string;
	method: 'POST' | 'PUT' | 'DELETE';
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
	/** Shape check for the body (beyond allowed field names); returns a reason to refuse. */
	validate?: (body: Json) => string | null;
	/** PUT only: refuse after reading the current record (e.g. "already has a birthday"). */
	refuseIf?: (current: Json) => string | null;
}

const oneTagName = (b: Json) => {
	const t = b.tags;
	return Array.isArray(t) && t.length === 1 && typeof t[0] === 'string' && t[0].trim().length > 0 && t[0].length <= 255 ? null : 'exactly one tag name';
};
const oneTagId = (b: Json) => {
	const t = b.tags;
	return Array.isArray(t) && t.length === 1 && Number.isInteger(t[0]) && (t[0] as number) > 0 ? null : 'exactly one tag id';
};

/**
 * The write allowlist. Before adding an entry: write its guard test, run it on
 * staging, show the owner the audit log before/after JSON, and wait for approval
 * (frontend/CLAUDE.md). Only creates so far: nothing here can change or remove an
 * existing record. Fields are exactly what the Log form sends (src/lib/log.ts).
 */
export const WRITE_ALLOWLIST: readonly WriteRule[] = [
	// Slice 4, log hangouts: one activity for everyone who was there (Monica 4.1.2 CreateActivity)
	{
		key: 'activity.create',
		method: 'POST',
		path: '/api/activities',
		editableFields: ['summary', 'description', 'happened_at', 'activity_type_id', 'contacts']
	},
	// ...plus an optional note on each person's page ("what I learned about them")
	{ key: 'note.create', method: 'POST', path: '/api/notes', editableFields: ['contact_id', 'body'] },
	// Removing (owner decision 2026-11-23): confirmed in the UI, record saved to the audit log first
	{ key: 'activity.delete', method: 'DELETE', path: '/api/activities/{id}', editableFields: [] },
	{ key: 'note.delete', method: 'DELETE', path: '/api/notes/{id}', editableFields: [] },
	{ key: 'journal.delete', method: 'DELETE', path: '/api/journal/{id}', editableFields: [] },
	// Birthdays (2026-11-23): only the birthday fields; everything Monica's UpdateContact would
	// otherwise blank is taken from a fresh GET. Never overwrites an existing birthday.
	{
		key: 'contact.birthday',
		method: 'PUT',
		path: '/api/contacts/{id}',
		editableFields: ['is_birthdate_known', 'birthdate_day', 'birthdate_month', 'birthdate_year', 'birthdate_is_age_based', 'birthdate_add_reminder'],
		toPayload: basePayloadFromContact,
		refuseIf: (current) => (contactHasBirthday(current) ? 'this contact already has a birthday in Monica' : null)
	},
	// Correcting a birthday (2026-11-23): only for contacts that already have one, and
	// only an exact date (never age-based). Monica replaces the birthday and its yearly
	// reminder; the caller keeps the reminder only if there is one now.
	{
		key: 'contact.birthday.change',
		method: 'PUT',
		path: '/api/contacts/{id}',
		editableFields: ['is_birthdate_known', 'birthdate_day', 'birthdate_month', 'birthdate_year', 'birthdate_is_age_based', 'birthdate_add_reminder'],
		toPayload: basePayloadFromContact,
		validate: (b) =>
			b.is_birthdate_known === true && b.birthdate_is_age_based === false && typeof b.birthdate_add_reminder === 'boolean' && Number.isInteger(b.birthdate_day) && Number.isInteger(b.birthdate_month)
				? null
				: 'an exact birthday (day and month) is required',
		refuseIf: (current) => (contactHasBirthday(current) ? null : 'this contact has no birthday yet (add one instead)')
	},
	// Bulk tags (2026-11-23): one tag on one contact per request. setTags only adds;
	// unsetTag only detaches (the tag stays in Monica). unsetTags (all tags) is never allowed.
	{ key: 'contact.tags.add', method: 'POST', path: '/api/contacts/{id}/setTags', editableFields: ['tags'], validate: oneTagName },
	{ key: 'contact.tags.remove', method: 'POST', path: '/api/contacts/{id}/unsetTag', editableFields: ['tags'], validate: oneTagId },
	// Renaming a tag (2026-11-24): one write; every contact keeps the tag. Fresh GET of
	// the tag, conflict check on its updated_at; only the name is sent.
	{
		key: 'tag.rename',
		method: 'PUT',
		path: '/api/tags/{id}',
		editableFields: ['name'],
		toPayload: () => ({}),
		validate: (b) => (typeof b.name === 'string' && b.name.trim() === b.name && b.name.length >= 1 && b.name.length <= 255 ? null : 'a tag name (1-255 characters, no surrounding spaces)')
	},
	// Journal entries (2026-11-23): Monica accepts only title and post (the date is the day it is saved)
	// Contact photos (2026-11-23): upload one image for one contact, then make it the avatar.
	// Old photos stay in Monica; nothing is removed.
	{
		key: 'photo.upload',
		method: 'POST',
		path: '/api/photos',
		editableFields: ['contact_id', 'data'],
		validate: (b) => (Number.isInteger(b.contact_id) && (b.contact_id as number) > 0 ? checkPhotoDataUrl(b.data) : 'a contact id is required')
	},
	{
		key: 'contact.avatar',
		method: 'PUT',
		path: '/api/contacts/{id}/avatar',
		readPath: '/api/contacts/{id}',
		editableFields: ['source', 'photo_id'],
		// The avatar endpoint takes only these two fields; it changes nothing else on the contact.
		toPayload: () => ({}),
		validate: (b) => (b.source === 'photo' && Number.isInteger(b.photo_id) && (b.photo_id as number) > 0 ? null : 'source "photo" and a photo id are required')
	},
	{
		key: 'journal.create',
		method: 'POST',
		path: '/api/journal',
		editableFields: ['title', 'post'],
		validate: (b) =>
			typeof b.title === 'string' && b.title.trim() && b.title.length <= 255 && typeof b.post === 'string' && b.post.trim() && b.post.length <= 1_000_000
				? null
				: 'title (up to 255 characters) and text are required'
	}
];

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
	/** `id` fills `{id}` in the rule's path (e.g. the contact for setTags). */
	create(key: string, body: Json, id?: number): Promise<WriteResult>;
	update(key: string, id: number, changes: Json, expectedUpdatedAt: string): Promise<WriteResult>;
	/** Remove one allowlisted record; the full record is saved to the audit log first. */
	remove(key: string, id: number, expectedUpdatedAt: string): Promise<WriteResult>;
}

/** Check a method and path against the read-only switch and allowlist. Throws if refused. */
export function checkWrite(
	method: string,
	path: string,
	opts: { readOnly: boolean; allowlist: readonly WriteRule[] }
): WriteRule {
	const m = method.toUpperCase();
	if (m === 'GET') throw new WriteRefusedError('not-allowlisted', 'GET is not a write');
	if (opts.readOnly) {
		throw new WriteRefusedError('read-only', `orbit is read-only (ORBIT_READ_ONLY=true): ${m} ${path} refused`);
	}
	assertApiPath(path);
	const rule = opts.allowlist.find((r) => r.method === m && matchPath(r.path, path));
	if (!rule && m === 'DELETE') throw new WriteRefusedError('delete-forbidden', `orbit does not delete ${path}`);
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
	function precheck(method: 'POST' | 'PUT' | 'DELETE', key: string, id: number | null, fields: Json) {
		const rule = allowlist.find((r) => r.key === key && r.method === method);
		const path = rule ? rule.path.replace('{id}', String(id)) : `(no rule "${key}")`;
		guarded(method, path, id, () => {
			if (!rule) {
				if (opts.readOnly) checkWrite(method, path, { readOnly: true, allowlist });
				throw new WriteRefusedError('not-allowlisted', `No ${method} rule "${key}" on the write allowlist`);
			}
			if (opts.readOnly) checkWrite(method, path, { readOnly: true, allowlist });
			const needsId = rule.path.includes('{id}');
			if (needsId !== (id !== null && Number.isInteger(id) && id > 0)) {
				throw new WriteRefusedError('bad-path', needsId ? `${rule.key} needs a record id` : `${rule.key} takes no record id`);
			}
			checkWrite(method, path, { readOnly: opts.readOnly, allowlist });
			assertFields(rule, fields);
			if (method !== 'DELETE' && rule.validate) {
				const why = rule.validate(fields);
				if (why) throw new WriteRefusedError('invalid-body', `${rule.key}: ${why}`);
			}
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
		async create(key, body, id) {
			const { path } = precheck('POST', key, id ?? null, body);
			return send('POST', path, id ?? null, null, { ...body });
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

			// Rule-specific refusal on the current record (e.g. never overwrite a birthday)
			const why = rule.refuseIf?.(current);
			if (why) {
				audit.start({ method: 'PUT', endpoint: path, monicaId: id, before: current, dryRun: opts.dryRun, result: 'refused:precondition' });
				throw new WriteRefusedError('precondition', `${rule.key}: ${why}`);
			}

			// Merge: full payload from the current record, then only the edited fields.
			const payload = { ...rule.toPayload!(current), ...changes };
			return send('PUT', path, id, current, payload);
		},

		async remove(key, id, expectedUpdatedAt) {
			if (!Number.isInteger(id) || id <= 0) throw new WriteRefusedError('bad-path', `Invalid id ${id}`);
			const { rule, path } = precheck('DELETE', key, id, {});

			// Read the record first: it must exist, must not have changed, and a full
			// copy goes into the audit log so it can be recreated by hand.
			const readPath = (rule.readPath ?? rule.path).replace('{id}', String(id));
			const current = unwrap(await transport.request('GET', readPath));
			if (current.updated_at !== expectedUpdatedAt) {
				audit.start({ method: 'DELETE', endpoint: path, monicaId: id, before: current, dryRun: opts.dryRun, result: 'conflict' });
				throw new ConflictError(path, expectedUpdatedAt, current.updated_at);
			}
			if (opts.dryRun) {
				const auditId = audit.start({ method: 'DELETE', endpoint: path, monicaId: id, before: current, dryRun: true, result: 'dry-run' });
				return { auditId, dryRun: true, payload: {}, response: null };
			}
			const auditId = audit.start({ method: 'DELETE', endpoint: path, monicaId: id, before: current, dryRun: false, result: 'pending' });
			let response: unknown;
			try {
				response = await transport.request('DELETE', path, { deleteCapability: DELETE_CAPABILITY });
			} catch (err) {
				audit.finish(auditId, `error:${(err as Error).message}`);
				throw err;
			}
			audit.finish(auditId, 'ok', response);
			opts.onWrite?.();
			return { auditId, dryRun: false, payload: {}, response };
		}
	};
}
