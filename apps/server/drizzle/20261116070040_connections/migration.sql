CREATE TABLE `connections` (
	`address` text PRIMARY KEY,
	`key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issued_keys` (
	`key` text PRIMARY KEY,
	`browser` text NOT NULL,
	`address` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_issued_keys_address_connections_address_fk` FOREIGN KEY (`address`) REFERENCES `connections`(`address`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `devices` ADD `issued_by` text REFERENCES devices(hash) ON DELETE CASCADE;