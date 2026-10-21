ALTER TABLE `projects` ADD `position` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `projects` SET `position` = (SELECT count(*) FROM `projects` AS `other` WHERE `other`.`name` < `projects`.`name` COLLATE NOCASE OR (`other`.`name` = `projects`.`name` COLLATE NOCASE AND `other`.`id` < `projects`.`id`));
