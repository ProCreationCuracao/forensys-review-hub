import { supabaseServer } from "../lib/supabase/server";

export type SignedInUser = { userId: string; displayName: string; email: string; fullName: string | null };

/** The signed-in Supabase user, or null. Access to data is decided separately (users table). */
export async function getSignedInUser(): Promise<SignedInUser | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return null;
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
  return { userId: user.id, email: user.email, displayName: fullName ?? user.email, fullName };
}
