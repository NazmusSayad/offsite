CREATE TABLE `machine` (
	`id` text PRIMARY KEY,
	`push_public_key` text NOT NULL,
	`push_private_key` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`path` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`logo` text
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`server` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY,
	`interacted_at` integer,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tokens` (
	`hash` text PRIMARY KEY,
	`name` text,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
