CREATE TABLE `acciones` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo_accion` text NOT NULL,
	`payload` text NOT NULL,
	`estado` text NOT NULL,
	`creada` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `acciones_estado_idx` ON `acciones` (`estado`);--> statement-breakpoint
CREATE TABLE `atributos` (
	`objeto_id` text NOT NULL,
	`clave` text NOT NULL,
	`valor_texto` text,
	`valor_numero` real,
	`valor_fecha` text,
	FOREIGN KEY (`objeto_id`) REFERENCES `objetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `atributos_objeto_id_idx` ON `atributos` (`objeto_id`);--> statement-breakpoint
CREATE INDEX `atributos_clave_valor_texto_idx` ON `atributos` (`clave`,`valor_texto`);--> statement-breakpoint
CREATE TABLE `conversaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text,
	`creada` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `embeddings` (
	`fragmento_id` text NOT NULL,
	`modelo` text NOT NULL,
	`vector` blob NOT NULL,
	PRIMARY KEY(`fragmento_id`, `modelo`),
	FOREIGN KEY (`fragmento_id`) REFERENCES `fragmentos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `enlaces` (
	`origen_id` text NOT NULL,
	`destino_id` text NOT NULL,
	`contexto` text NOT NULL,
	FOREIGN KEY (`origen_id`) REFERENCES `objetos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destino_id`) REFERENCES `objetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `enlaces_origen_id_idx` ON `enlaces` (`origen_id`);--> statement-breakpoint
CREATE INDEX `enlaces_destino_id_idx` ON `enlaces` (`destino_id`);--> statement-breakpoint
CREATE TABLE `fragmentos` (
	`id` text PRIMARY KEY NOT NULL,
	`objeto_id` text NOT NULL,
	`encabezado` text,
	`texto` text NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`objeto_id`) REFERENCES `objetos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fragmentos_objeto_id_idx` ON `fragmentos` (`objeto_id`);--> statement-breakpoint
CREATE TABLE `mensajes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversacion_id` text NOT NULL,
	`rol` text NOT NULL,
	`contenido` text NOT NULL,
	`creada` text NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `conversaciones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mensajes_conversacion_id_idx` ON `mensajes` (`conversacion_id`);--> statement-breakpoint
CREATE TABLE `meta` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `objetos` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo_id` text NOT NULL,
	`titulo` text NOT NULL,
	`ruta` text NOT NULL,
	`hash` text NOT NULL,
	`creado` text NOT NULL,
	`actualizado` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `objetos_tipo_id_idx` ON `objetos` (`tipo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `objetos_ruta_unique` ON `objetos` (`ruta`);--> statement-breakpoint
CREATE VIRTUAL TABLE `fts_objetos` USING fts5(`titulo`, `cuerpo`, `atributos`, `objeto_id` UNINDEXED, tokenize = 'unicode61');