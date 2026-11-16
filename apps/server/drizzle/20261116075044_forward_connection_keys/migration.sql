PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`hash` text PRIMARY KEY,
	`name` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_devices`(`hash`, `name`, `created_at`, `expires_at`, `last_used_at`) SELECT `hash`, `name`, `created_at`, `expires_at`, `last_used_at` FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP TABLE `issued_keys`;