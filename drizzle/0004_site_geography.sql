CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "origin" geography(Point, 4326);--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "parcel" geography(Geometry, 4326);
