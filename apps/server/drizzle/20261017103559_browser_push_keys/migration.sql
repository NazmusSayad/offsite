DROP TABLE `push_subscriptions`;--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text NOT NULL,
	`server` text NOT NULL
);--> statement-breakpoint
ALTER TABLE `machine` DROP COLUMN `push_public_key`;--> statement-breakpoint
ALTER TABLE `machine` DROP COLUMN `push_private_key`;
