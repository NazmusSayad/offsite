ALTER TABLE `connections` ADD `addresses` text NOT NULL DEFAULT '[]';--> statement-breakpoint
UPDATE `connections` SET `addresses` = json_array(`address`);--> statement-breakpoint
ALTER TABLE `connections` ADD `name` text;
