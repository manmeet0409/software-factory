CREATE TABLE `activityLogs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticketId` text NOT NULL,
	`action` text NOT NULL,
	`fromStatus` text,
	`toStatus` text,
	`actor` text NOT NULL,
	`summary` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`ticketId`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticketId` text NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`type` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`ticketId`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`parentTicketId` text,
	`summary` text,
	`worktreeDir` text,
	`acpSessionId` text,
	`assignedModel` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`parentTicketId`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
