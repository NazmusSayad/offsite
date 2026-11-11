CREATE TABLE `interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`provider` text NOT NULL,
	`account` text,
	`model` text,
	`effort` text,
	`project` text NOT NULL,
	`project_worktree` text,
	`project_session` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `last_sent`;--> statement-breakpoint
DROP TABLE `last_efforts`;--> statement-breakpoint
DROP TABLE `last_used_models`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `active_at`;