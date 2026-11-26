CREATE TABLE `avatar_thumbs` (
	`monica_contact_id` integer PRIMARY KEY NOT NULL,
	`photo_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`created_at` text NOT NULL
);
