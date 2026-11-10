"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../lib/supabase/browser";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) { setError(err.message === "Invalid login credentials" ? "Email or password is incorrect." : err.message); return; }
    router.refresh();
  };
  return <form className="login-form" onSubmit={submit}>
    <label><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@forensys.com"/></label>
    <label><span>Password</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)}/></label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button className="button primary login-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}
