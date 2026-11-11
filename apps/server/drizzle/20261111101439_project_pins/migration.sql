ALTER TABLE `projects` ADD `pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `active_at` integer;--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `hidden`;