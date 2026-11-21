// Diary (read-only): activities across all contacts plus Monica journal entries.
import type { DiaryItem } from '../../log';
import type { MonicaClient } from './client';
import { activityType, activityWithAttendees, journalEntry } from './schemas';
import { displayName } from '../../contacts';

export async function loadDiary(client: MonicaClient): Promise<DiaryItem[]> {
	const [activities, entries] = await Promise.all([
		client.getAll('/api/activities', activityWithAttendees),
		client.getAll('/api/journal', journalEntry)
	]);
	const items: DiaryItem[] = [
		...activities.map((a) => ({
			kind: 'hangout' as const,
			id: a.id,
			date: a.happened_at,
			title: a.summary || a.activity_type?.name || 'Hangout',
			body: a.description ?? null,
			type: a.activity_type?.name ?? null,
			people: (a.attendees?.contacts ?? []).map((c) => ({ id: c.id, name: displayName(null, null, c.complete_name) }))
		})),
		...entries.map((e) => ({
			kind: 'journal' as const,
			id: e.id,
			date: e.date || e.created_at,
			title: e.title || 'Journal entry',
			body: e.post ?? null,
			type: null,
			people: []
		}))
	];
	return items.sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) || b.id - a.id);
}

export async function listActivityTypes(client: MonicaClient) {
	const types = await client.getAll('/api/activitytypes', activityType);
	return types.map((t) => ({ id: t.id, name: t.name, category: t.activity_type_category?.name ?? null }));
}
