import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
