import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase Postgres. Uses FORENSYS_DATABASE_URL / DATABASE_URL when set, otherwise the
// POSTGRES_URL that the Vercel ↔ Supabase integration provides (transaction pooler).
const globalForDb = globalThis as unknown as { __forensysSql?: ReturnType<typeof postgres> };

function connectionString() {
  const raw = process.env.FORENSYS_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!raw) throw new Error("No database connection string is set (FORENSYS_DATABASE_URL, DATABASE_URL or POSTGRES_URL).");
  // Keep only parameters postgres.js understands (the integration adds extra ones like `supa=`).
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) if (key !== "sslmode") url.searchParams.delete(key);
  return url.toString();
}

export function getDb() {
  globalForDb.__forensysSql ??= postgres(connectionString(), { prepare: false, max: 5, idle_timeout: 20, ssl: "require" });
  return drizzle(globalForDb.__forensysSql, { schema });
}
