CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dub_takes` (
	`dub_id` text NOT NULL,
	`take_id` text NOT NULL,
	PRIMARY KEY(`dub_id`, `take_id`),
	FOREIGN KEY (`dub_id`) REFERENCES `dubs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`take_id`) REFERENCES `takes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dubs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`work_id` text NOT NULL,
	`version_id` text NOT NULL,
	`content` text NOT NULL,
	`visibility` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `work_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stars` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`target_type`, `target_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_once` ON `reports` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `takes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`work_id` text NOT NULL,
	`version_id` text NOT NULL,
	`scene_id` text,
	`asset_id` text NOT NULL,
	`duration` integer NOT NULL,
	`label` text NOT NULL,
	`source_kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `work_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `version_assets` (
	`version_id` text NOT NULL,
	`asset_id` text NOT NULL,
	PRIMARY KEY(`version_id`, `asset_id`),
	FOREIGN KEY (`version_id`) REFERENCES `work_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `work_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`content` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`current_version` text NOT NULL,
	`visibility` text NOT NULL,
	`allow_dub` integer DEFAULT 0 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `works_owner` ON `works` (`owner_id`);--> statement-breakpoint
CREATE INDEX `works_public` ON `works` (`visibility`,`deleted`);