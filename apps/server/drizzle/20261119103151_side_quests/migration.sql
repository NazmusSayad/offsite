CREATE TABLE `side_quests` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`quest_id` text NOT NULL,
	`question` text NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`answer` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
