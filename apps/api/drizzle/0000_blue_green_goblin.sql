CREATE SCHEMA "messaging";
--> statement-breakpoint
CREATE TABLE "messaging"."processed" (
	"queue" text NOT NULL,
	"message_id" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_queue_message_id_pk" PRIMARY KEY("queue","message_id")
);
