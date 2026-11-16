CREATE TABLE `notice_icons` (
	`key` text PRIMARY KEY,
	`project_id` text,
	`image` blob NOT NULL,
	CONSTRAINT `fk_notice_icons_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
