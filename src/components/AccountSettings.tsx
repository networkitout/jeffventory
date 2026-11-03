"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { fetchJson, jsonRequest } from "@/lib/client-api";

type Member = { id: string; name: string; email: string; role: string; banned: boolean };

export default function AccountSettings({ name, email, owner }: { name: string; email: string; owner: boolean }) {
  const router = useRouter();
  const { data: passkeys, isPending, error: passkeyError, refetch } = authClient.useListPasskeys();
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!owner) return;
    let active = true;
    fetchJson<Member[]>("/api/users").then(data => { if (active) setMembers(data); }).catch(() => { if (active) setError("Could not load accounts. Reload to try again."); });
    return () => { active = false; };
  }, [owner]);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }
  function check(result: { error: { message?: string } | null }) { if (result.error) throw new Error(result.error.message || "Operation failed. Try again."); }

  return <div>
    <header className="page-header"><div><h1>Account &amp; access</h1><p>{name} · {email}{owner ? " · Owner" : ""}</p></div></header>
    {error && <p role="alert" className="notice">{error}</p>}
    {message && <p role="status" className="notice">{message}</p>}
    <section className="data-section">
      <h2>Your passkeys</h2>
      <p>Add a passkey for quick sign-in. Keep a backup passkey or your password in a password manager. Managing passkeys requires a sign-in within the last 10 minutes.</p>
      {isPending ? <p role="status">Loading passkeys…</p> : passkeyError ? <p role="alert">Could not load passkeys. <button className="button" onClick={() => void refetch()}>Retry</button></p> :
        passkeys?.length ? <ul className="account-list">{passkeys.map(key => <li key={key.id}><span>{key.name || "Passkey"}</span><button className="button button-small" disabled={busy} onClick={() => {
          if (window.confirm("Remove this passkey? You can still sign in with your password or another passkey.")) void perform(async () => { check(await authClient.passkey.deletePasskey({ id: key.id })); await refetch(); setMessage("Passkey removed."); });
        }}>Remove {key.name || "passkey"}</button></li>)}</ul> : <p>No passkeys added yet.</p>}
      <form className="field-stack auth-panel" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void perform(async () => {
          if (!window.isSecureContext || !window.PublicKeyCredential) throw new Error("Passkeys require a supported browser on localhost or trusted HTTPS.");
          check(await authClient.passkey.addPasskey({ name: String(data.get("name")) }));
          form.reset(); await refetch(); setMessage("Passkey added. You can use it the next time you sign in.");
        });
      }}>
        <div><label htmlFor="passkey-name" className="field-label">Passkey name</label><input id="passkey-name" name="name" className="input" placeholder="My phone or security key" maxLength={100} required /></div>
        <button className="button button-primary" disabled={busy}>Add a passkey</button>
      </form>
    </section>
    <section className="data-section">
      <h2>Password &amp; sessions</h2>
      <form className="field-stack auth-panel" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void perform(async () => {
          if (data.get("newPassword") !== data.get("confirmPassword")) throw new Error("The new passwords do not match.");
          check(await authClient.changePassword({ currentPassword: String(data.get("currentPassword")), newPassword: String(data.get("newPassword")), revokeOtherSessions: true }));
          form.reset(); setMessage("Password changed. Other sessions have been signed out.");
        });
      }}>
        <div><label htmlFor="current-password" className="field-label">Current password</label><input id="current-password" name="currentPassword" type="password" className="input" autoComplete="current-password" required maxLength={128} /></div>
        <div><label htmlFor="new-password" className="field-label">New password</label><input id="new-password" name="newPassword" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
        <div><label htmlFor="confirm-password" className="field-label">Confirm new password</label><input id="confirm-password" name="confirmPassword" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
        <button className="button" disabled={busy}>Change password</button>
      </form>
      <div className="actions mt-4">
        <button className="button" disabled={busy} onClick={() => void perform(async () => { check(await authClient.revokeOtherSessions()); setMessage("Other sessions have been signed out."); })}>Sign out other devices</button>
        <button className="button" disabled={busy} onClick={() => void perform(async () => { check(await authClient.signOut()); router.replace("/login"); router.refresh(); })}>Sign out</button>
      </div>
    </section>
    {owner && <section className="data-section">
      <h2>Shared inventory access</h2><p>Every enabled account can view, edit, delete, and export this inventory. Only you can manage accounts. Share the initial password privately; members can change it after signing in.</p>
      <ul className="account-list">{members.map(member => <li key={member.id}>
        <span>{member.name} · {member.email} · {member.role === "admin" ? "Owner" : member.banned ? "Disabled" : "Member"}</span>
        {member.role !== "admin" && <button className="button button-small" disabled={busy} onClick={() => {
          if (window.confirm(`${member.banned ? "Enable" : "Disable"} access for ${member.email}? Existing sessions will be signed out.`)) void perform(async () => {
            await fetchJson("/api/users", jsonRequest("PATCH", { id: member.id, banned: !member.banned }));
            setMembers(await fetchJson<Member[]>("/api/users")); setMessage("Access updated.");
          });
        }}>{member.banned ? "Enable access" : "Disable access"}</button>}
      </li>)}</ul>
      <form className="field-stack auth-panel" onSubmit={event => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
        void perform(async () => {
          await fetchJson("/api/users", jsonRequest("POST", Object.fromEntries(data)));
          form.reset(); setMembers(await fetchJson<Member[]>("/api/users")); setMessage("Account created. Share its initial password privately.");
        });
      }}>
        <div><label htmlFor="member-name" className="field-label">Member name</label><input id="member-name" name="name" className="input" required maxLength={100} /></div>
        <div><label htmlFor="member-email" className="field-label">Member email</label><input id="member-email" name="email" type="email" className="input" autoComplete="off" required maxLength={254} /></div>
        <div><label htmlFor="member-password" className="field-label">Initial password</label><input id="member-password" name="password" type="password" className="input" autoComplete="new-password" required minLength={12} maxLength={128} /></div>
        <button className="button button-primary" disabled={busy}>Create member account</button>
      </form>
    </section>}
  </div>;
}
