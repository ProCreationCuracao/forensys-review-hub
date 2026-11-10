CREATE TABLE `evaluation_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`score_bands` text DEFAULT '[]' NOT NULL,
	`sections` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `template_id` text;--> statement-breakpoint
ALTER TABLE `reviews` ADD `form_data` text DEFAULT '' NOT NULL;