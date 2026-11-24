CREATE TABLE `souvenir_list` (
	`trip_id` integer NOT NULL,
	`monica_contact_id` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`trip_id`, `monica_contact_id`),
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`destination` text,
	`start_date` text,
	`end_date` text,
	`created_at` text NOT NULL
);
