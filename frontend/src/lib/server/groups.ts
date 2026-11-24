// Friend groups: orbit's own data (slice 5). Members are Monica contact ids; nothing
// here writes to Monica. Deleting a group only removes orbit's record of it.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { OrbitDb } from './db';
import { groupMembers, groups } from './db/schema';

export interface Group {
	id: number;
	name: string;
	members: number[];
}
type Result = { ok: boolean; message: string; id?: number };
const NAME_MAX = 80;

export function listGroups(db: OrbitDb): Group[] {
	const gs = db.select().from(groups).orderBy(asc(groups.name)).all();
	const ms = db.select().from(groupMembers).all();
	return gs.map((g) => ({ id: g.id, name: g.name, members: ms.filter((m) => m.groupId === g.id).map((m) => m.monicaContactId) }));
}

export const getGroup = (db: OrbitDb, id: number) => listGroups(db).find((g) => g.id === id) ?? null;
export const groupsFor = (db: OrbitDb, contactId: number) => listGroups(db).filter((g) => g.members.includes(contactId));

const cleanName = (v: FormDataEntryValue | null) => String(v ?? '').trim().replace(/\s+/g, ' ');

export function createGroup(db: OrbitDb, form: FormData, known: Set<number>, now = new Date()): Result {
	const name = cleanName(form.get('name'));
	if (!name) return { ok: false, message: 'Name the group.' };
	if (name.length > NAME_MAX) return { ok: false, message: `Keep the name under ${NAME_MAX} characters.` };
	if (listGroups(db).some((g) => g.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return { ok: false, message: `There is already a group called “${name}”.` };
	const members = parseIds(form);
	if (members.some((id) => !known.has(id))) return { ok: false, message: 'Someone picked is not in Monica any more. Reload and try again.' };
	const row = db.insert(groups).values({ name, createdAt: now.toISOString() }).returning({ id: groups.id }).get();
	if (members.length) db.insert(groupMembers).values(members.map((m) => ({ groupId: row.id, monicaContactId: m, addedAt: now.toISOString() }))).run();
	return { ok: true, id: row.id, message: `Created “${name}”${members.length ? ` with ${members.length} ${members.length === 1 ? 'person' : 'people'}` : ''}.` };
}

export function renameGroup(db: OrbitDb, id: number, form: FormData): Result {
	const g = getGroup(db, id);
	if (!g) return { ok: false, message: 'That group is gone. Reload the page.' };
	const name = cleanName(form.get('name'));
	if (!name || name.length > NAME_MAX) return { ok: false, message: `Name it (up to ${NAME_MAX} characters).` };
	if (listGroups(db).some((x) => x.id !== id && x.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return { ok: false, message: `There is already a group called “${name}”.` };
	db.update(groups).set({ name }).where(eq(groups.id, id)).run();
	return { ok: true, id, message: `Renamed to “${name}”.` };
}

/** Replace the member list with the picked people. */
export function setMembers(db: OrbitDb, id: number, form: FormData, known: Set<number>, now = new Date()): Result {
	const g = getGroup(db, id);
	if (!g) return { ok: false, message: 'That group is gone. Reload the page.' };
	const want = parseIds(form);
	if (want.some((m) => !known.has(m))) return { ok: false, message: 'Someone picked is not in Monica any more. Reload and try again.' };
	const add = want.filter((m) => !g.members.includes(m));
	const drop = g.members.filter((m) => !want.includes(m));
	if (add.length) db.insert(groupMembers).values(add.map((m) => ({ groupId: id, monicaContactId: m, addedAt: now.toISOString() }))).run();
	if (drop.length) db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), inArray(groupMembers.monicaContactId, drop))).run();
	return { ok: true, id, message: add.length || drop.length ? `Saved: ${want.length} ${want.length === 1 ? 'person' : 'people'} in the group.` : 'No changes.' };
}

/** Removes orbit's group record (and its member list). Monica contacts are untouched. */
export function deleteGroup(db: OrbitDb, id: number, form: FormData): Result {
	if (form.get('confirm') !== 'yes') return { ok: false, message: 'Tick the box to confirm.' };
	const g = getGroup(db, id);
	if (!g) return { ok: false, message: 'That group is gone already.' };
	db.delete(groups).where(eq(groups.id, id)).run();
	return { ok: true, message: `Deleted the group “${g.name}”. Its people are unchanged in Monica.` };
}

function parseIds(form: FormData): number[] {
	const ids = form.getAll('member').map((v) => z.coerce.number().int().positive().safeParse(v));
	return [...new Set(ids.filter((r) => r.success).map((r) => r.data as number))].slice(0, 500);
}
