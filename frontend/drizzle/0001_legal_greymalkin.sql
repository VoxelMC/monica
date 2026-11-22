CREATE TABLE `journal_mentions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`journal_entry_id` integer NOT NULL,
	`monica_contact_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
