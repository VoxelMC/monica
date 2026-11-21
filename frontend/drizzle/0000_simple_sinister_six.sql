CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`method` text NOT NULL,
	`endpoint` text NOT NULL,
	`monica_id` integer,
	`before_json` text,
	`after_json` text,
	`dry_run` integer NOT NULL,
	`result` text NOT NULL
);
