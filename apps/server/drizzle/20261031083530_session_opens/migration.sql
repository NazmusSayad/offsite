CREATE TABLE `session_opens` (
	`session_id` text PRIMARY KEY,
	`score` real NOT NULL,
	`opened_at` integer NOT NULL,
	`picks` text NOT NULL
);
