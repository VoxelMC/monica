CREATE TABLE `group_members` (
	`group_id` integer NOT NULL,
	`monica_contact_id` integer NOT NULL,
	`added_at` text NOT NULL,
	PRIMARY KEY(`group_id`, `monica_contact_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
