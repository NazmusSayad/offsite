DELETE FROM `push_subscriptions`;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `machine` text NOT NULL;--> statement-breakpoint
DROP TABLE `machine`;
