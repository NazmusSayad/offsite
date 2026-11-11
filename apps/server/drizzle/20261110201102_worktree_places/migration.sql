CREATE TABLE `session_places` (
	`session_id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`claude_worktree` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `worktree_branch` text;