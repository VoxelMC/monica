CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monica_contact_id` integer NOT NULL,
	`contact_name` text NOT NULL,
	`note` text NOT NULL,
	`due_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text,
	`done_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`last_error` text
);
