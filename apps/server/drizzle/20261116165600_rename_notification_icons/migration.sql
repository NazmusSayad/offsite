DROP TABLE `notice_icons`;--> statement-breakpoint
CREATE TABLE `notification_icons` (
	`key` text PRIMARY KEY,
	`project_id` text,
	`image` blob NOT NULL,
	CONSTRAINT `fk_notification_icons_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
UPDATE `generations` SET `task` = 'notification-summary' WHERE `task` = 'notice-summary';
