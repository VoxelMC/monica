// The transport sends a DELETE only when handed this token. guards.ts is the
// only module meant to pass it (after allowlist, snapshot and conflict checks);
// tests check that plain requests are refused.
export const DELETE_CAPABILITY: unique symbol = Symbol('orbit-delete-capability');

/** The only things orbit may ever delete (owner decision 2026-11-23). Never contacts. */
export const DELETABLE_PATH = /^\/api\/(activities|notes|journal)\/\d+$/;

// Merging duplicates (owner decision 2026-11-26): a contact may be deleted only as the
// last step of a merge the owner confirmed. guards.removeMergedDuplicate is the only
// holder of this token; it re-reads the copy and refuses unless nothing is left on it.
export const MERGE_DELETE_CAPABILITY: unique symbol = Symbol('orbit-merge-delete-capability');
export const MERGED_CONTACT_PATH = /^\/api\/contacts\/\d+$/;
