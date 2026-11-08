CREATE TABLE `last_efforts` (
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`effort` text,
	CONSTRAINT `last_efforts_pk` PRIMARY KEY(`provider`, `model`)
);
