CREATE TABLE `unsent_prompts` (
	`id` text PRIMARY KEY,
	`session_id` text,
	`project_id` text NOT NULL,
	`request` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
