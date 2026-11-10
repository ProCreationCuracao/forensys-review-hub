"use client";
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_FORENSYS_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_FORENSYS_SUPABASE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
