CREATE TABLE `worktrees` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`path` text NOT NULL UNIQUE,
	`branch` text,
	CONSTRAINT `fk_worktrees_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `worktrees` (`id`, `project_id`, `path`, `branch`) SELECT `id`, `parent_id`, rtrim(`path`, '/\'), `worktree_branch` FROM `projects` WHERE `parent_id` IN (SELECT `id` FROM `projects`);--> statement-breakpoint
ALTER TABLE `outbox` ADD `worktree_id` text;--> statement-breakpoint
UPDATE `outbox` SET `worktree_id` = `project_id`, `project_id` = (SELECT `project_id` FROM `worktrees` WHERE `worktrees`.`id` = `outbox`.`project_id`) WHERE `project_id` IN (SELECT `id` FROM `worktrees`);--> statement-breakpoint
ALTER TABLE `session_places` ADD `worktree_id` text REFERENCES worktrees(id) ON DELETE CASCADE;--> statement-breakpoint
UPDATE `session_places` SET `worktree_id` = `project_id`, `project_id` = (SELECT `project_id` FROM `worktrees` WHERE `worktrees`.`id` = `session_places`.`project_id`) WHERE `project_id` IN (SELECT `id` FROM `worktrees`);--> statement-breakpoint
DELETE FROM `projects` WHERE `parent_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `parent_id`;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `worktree_branch`;
