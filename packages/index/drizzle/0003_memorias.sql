CREATE TABLE `memorias` (
	`id` text PRIMARY KEY NOT NULL,
	`clave` text NOT NULL,
	`contenido` text NOT NULL,
	`actualizada` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memorias_clave_unique` ON `memorias` (`clave`);