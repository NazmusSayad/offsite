CREATE TABLE `generations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`task` text NOT NULL,
	`provider` text NOT NULL,
	`account` text,
	`model` text NOT NULL,
	`instructions` text NOT NULL,
	`input` text NOT NULL,
	`output` text,
	`status` text NOT NULL,
	`error` text,
	`duration_ms` integer NOT NULL,
	`created_at` integer NOT NULL
);
