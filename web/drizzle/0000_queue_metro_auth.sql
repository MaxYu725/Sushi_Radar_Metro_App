CREATE TABLE `admins` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`public_key_spki` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE INDEX `admins_active_idx` ON `admins` (`revoked_at`);
--> statement-breakpoint
CREATE TABLE `web_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`authorized_at` integer,
	`authorized_by` text,
	`blocked_at` integer
);
--> statement-breakpoint
CREATE INDEX `web_devices_status_idx` ON `web_devices` (`status`,`last_seen_at`);
--> statement-breakpoint
CREATE INDEX `web_devices_note_idx` ON `web_devices` (`note`);
--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approval_token_hash` text NOT NULL,
	`poll_token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` text,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approval_requests_device_idx` ON `approval_requests` (`device_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `approval_requests_status_idx` ON `approval_requests` (`status`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_requests_token_idx` ON `approval_requests` (`approval_token_hash`);
--> statement-breakpoint
CREATE TABLE `admin_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`nonce` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE INDEX `admin_challenges_expiry_idx` ON `admin_challenges` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `web_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `web_sessions_token_idx` ON `web_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `web_sessions_device_idx` ON `web_sessions` (`device_id`,`expires_at`);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text,
	`device_id` text,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);
