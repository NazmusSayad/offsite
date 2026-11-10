CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`item_id` text,
	`start` integer,
	`end` integer,
	`created_at` integer NOT NULL
);
