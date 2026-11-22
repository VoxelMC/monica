// The transport sends a DELETE only when handed this token. guards.ts is the
// only module meant to pass it (after allowlist, snapshot and conflict checks);
// tests check that plain requests are refused.
export const DELETE_CAPABILITY: unique symbol = Symbol('orbit-delete-capability');

/** The only things orbit may ever delete (owner decision 2026-11-23). Never contacts. */
export const DELETABLE_PATH = /^\/api\/(activities|notes|journal)\/\d+$/;
