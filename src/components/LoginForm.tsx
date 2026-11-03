"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(form?: HTMLFormElement) {
    setBusy(true); setError("");
    try {
      const data = form ? new FormData(form) : null;
      const result = data
        ? await authClient.signIn.email({ email: String(data.get("email")), password: String(data.get("password")) })
        : await authClient.signIn.passkey();
      if (result.error) throw new Error(result.error.message || "Sign-in failed. Try again.");
      router.replace("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed. Try again."); setBusy(false); }
  }
  return <div className="auth-panel">
    <header className="page-header"><div><h1>Welcome to your workbench.</h1><p>Sign in to your shared inventory.</p></div></header>
    <button className="button button-primary w-full" disabled={busy} onClick={() => void signIn()}>Sign in with a passkey</button>
    <p className="field-hint mt-3">Use your fingerprint, face, device PIN, or security key. Passkeys need localhost or a trusted HTTPS connection.</p>
    <form className="field-stack mt-6" onSubmit={event => { event.preventDefault(); void signIn(event.currentTarget); }}>
      <div><label htmlFor="email" className="field-label">Email</label><input id="email" name="email" type="email" className="input" autoComplete="username webauthn" required maxLength={254} /></div>
      <div><label htmlFor="password" className="field-label">Password</label><input id="password" name="password" type="password" className="input" autoComplete="current-password" required maxLength={128} /></div>
      <button type="submit" className="button" disabled={busy}>{busy ? "Signing in…" : "Sign in with password"}</button>
    </form>
    {error && <p className="notice mt-4" role="alert">{error}</p>}
    <p className="field-hint mt-6">New here? Ask the inventory owner for an account. After signing in, add a passkey in Account &amp; access.</p>
    <p className="field-hint">Lost access? The owner can recover your account from the server console. Public registration and email password resets are disabled.</p>
  </div>;
}
