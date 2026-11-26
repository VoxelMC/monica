import { blob, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Extension DB. Slice 0 only needs the audit log; the slice 5 tables come later.

export const auditLog = sqliteTable('audit_log', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	at: text('at').notNull(), // ISO timestamp
	method: text('method').notNull(),
	endpoint: text('endpoint').notNull(),
	monicaId: integer('monica_id'),
	beforeJson: text('before_json'),
	afterJson: text('after_json'),
	dryRun: integer('dry_run', { mode: 'boolean' }).notNull(),
	// pending | ok | dry-run | refused:<reason> | conflict | error:<detail>
	result: text('result').notNull()
});

// Journal mentions (2026-11-23): Monica stores the entry text with a readable
// "@Full Name"; orbit stores which contact each mention meant (exact links).
export const journalMentions = sqliteTable('journal_mentions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	journalEntryId: integer('journal_entry_id').notNull(),
	monicaContactId: integer('monica_contact_id').notNull(),
	name: text('name').notNull(),
	createdAt: text('created_at').notNull()
});

// Timed reminders (2026-11-23): "message Sam at 15:40". orbit's own data, sent
// to the owner's phone through ntfy. Monica's reminders are date-only and come
// by email at one fixed hour, so these live here and never touch Monica.
export const reminders = sqliteTable('reminders', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	monicaContactId: integer('monica_contact_id').notNull(),
	contactName: text('contact_name').notNull(),
	note: text('note').notNull(), // may be empty
	dueAt: text('due_at').notNull(), // ISO UTC, e.g. 2026-11-24T23:40:00.000Z
	timeZone: text('time_zone').notNull(), // IANA zone the owner picked the time in
	createdAt: text('created_at').notNull(),
	sentAt: text('sent_at'), // when the notification was delivered to ntfy
	doneAt: text('done_at'), // marked done (or dismissed) by the owner
	attempts: integer('attempts').notNull().default(0),
	lastAttemptAt: text('last_attempt_at'),
	lastError: text('last_error')
});

// Catch-up targets (slice 5, 2026-11-24): "see Ana every 3 weeks". Monica's own
// "stay in touch" can't be set through its API, so orbit keeps its own target;
// where none is set here, Monica's stay-in-touch frequency is used.
export const contactMeta = sqliteTable('contact_meta', {
	monicaContactId: integer('monica_contact_id').primaryKey(),
	catchupIntervalDays: integer('catchup_interval_days'), // null = no orbit target
	updatedAt: text('updated_at').notNull()
});

// Friend groups (slice 5, 2026-11-24): orbit's own data; members are Monica contact ids.
export const groups = sqliteTable('groups', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	createdAt: text('created_at').notNull()
});
export const groupMembers = sqliteTable(
	'group_members',
	{
		groupId: integer('group_id')
			.notNull()
			.references(() => groups.id, { onDelete: 'cascade' }),
		monicaContactId: integer('monica_contact_id').notNull(),
		addedAt: text('added_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.groupId, t.monicaContactId] })]
);

// Souvenir lists (slice 5, 2026-11-24): "bring something back for…" per trip.
export const trips = sqliteTable('trips', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	destination: text('destination'),
	startDate: text('start_date'), // YYYY-MM-DD
	endDate: text('end_date'),
	createdAt: text('created_at').notNull()
});
export const souvenirList = sqliteTable(
	'souvenir_list',
	{
		tripId: integer('trip_id')
			.notNull()
			.references(() => trips.id, { onDelete: 'cascade' }),
		monicaContactId: integer('monica_contact_id').notNull(),
		note: text('note').notNull().default(''),
		done: integer('done', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.tripId, t.monicaContactId] })]
);

// Avatar thumbnails (2026-11-26): a small copy of each contact's Monica photo, so
// lists don't download every full photo from Monica again. Only a cache: Monica
// keeps the photo; a new photo (new photo_key) replaces the row.
export const avatarThumbs = sqliteTable('avatar_thumbs', {
	monicaContactId: integer('monica_contact_id').primaryKey(),
	photoKey: text('photo_key').notNull(),
	mime: text('mime').notNull(),
	bytes: blob('bytes', { mode: 'buffer' }).notNull(),
	createdAt: text('created_at').notNull()
});
