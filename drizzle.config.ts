import { defineConfig } from "drizzle-kit";

// Supabase Postgres schema. Migrations are in ./drizzle-pg.
export default defineConfig({ dialect: "postgresql", schema: "./db/schema.ts", out: "./drizzle-pg" });
