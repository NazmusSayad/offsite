CREATE TABLE `last_used_models` (
	`provider` text PRIMARY KEY,
	`account_id` text,
	`model` text NOT NULL,
	`used_at` integer NOT NULL
);
