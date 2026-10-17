CREATE TABLE `devices` (
	`hash` text PRIMARY KEY,
	`name` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`hash` text PRIMARY KEY,
	`name` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
DROP TABLE `tokens`;