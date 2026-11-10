import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase Postgres. DATABASE_URL = the "Transaction pooler" connection string
// (port 6543) from Supabase → Project Settings → Database.
const globalForDb = globalThis as unknown as { __forensysSql?: ReturnType<typeof postgres> };

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add the Supabase connection string to the environment.");
  globalForDb.__forensysSql ??= postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
  return drizzle(globalForDb.__forensysSql, { schema });
}
