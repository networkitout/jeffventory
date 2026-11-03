# Accounts and passkeys

Jeffventory has one private shared inventory per installation. The owner provisions member accounts; every enabled member has full inventory access. There is no public signup, public first-user claim, email service, or per-user inventory partition. Existing inventory remains in place when the additive authentication migration runs.

## First owner: local installation

1. Back up your database and photos while the app is stopped.
2. Set `BETTER_AUTH_SECRET` in `.env` to the output of `openssl rand -hex 32`. Keep it private and stable across restarts. Do not put it in source control.
3. Set `BETTER_AUTH_URL="http://localhost:3000"` for a local installation. Always open that exact hostname and port.
4. Run:

   ```bash
   npm run db:setup
   npm run auth:manage -- create-owner
   npm run dev
   ```

The account command asks for your email, display name, then a hidden password and confirmation (minimum 12 characters). Running `npm run auth:manage` without arguments also starts owner setup. Explicit email/name arguments remain available for automation. It will not create a second owner. No default password or authentication bypass exists. The supplied email is an account identifier; Jeffventory does not send or verify email.

Open `http://localhost:3000`, sign in with your password, then open **Account & access → Add a passkey**. Use a supported browser with a platform authenticator or security key. Device verification (biometric or PIN) is required. Registration, renaming, and removal require a session created within the last 10 minutes; sign out and sign back in if prompted.

## Shared access

The owner creates member accounts in **Account & access**, choosing an initial password to share privately. Members should change that password and enroll their own passkeys after signing in. Disabling a member immediately revokes their sessions and prevents new password/passkey sign-ins. Re-enabling permits their existing credentials again. Members cannot manage accounts or grant themselves owner privileges.

**Sign out other devices** revokes other sessions. A password change also revokes other sessions. Sessions expire after seven days and are checked against the database on each protected request; there is no cookie-only authorization cache. Only health and authentication endpoints are public. Inventory pages, APIs, exports, photos, and barcode rendering require an active account. Protected API responses use `private, no-store`.

## Docker and private HTTPS

Put the secret and exact browser origin in `.env.docker`; follow [DEPLOYMENT.md](DEPLOYMENT.md). Create the first owner after the container starts:

```bash
docker compose --env-file .env.docker exec app npm run auth:manage -- create-owner
```

Include `-f compose.yaml -f compose.https.yaml` when using the HTTPS overlay. For another device, use a stable DNS hostname such as `https://inventory.home.arpa:8443`, configure local DNS, and trust the private CA on that device. Plain HTTP LAN origins are rejected. Passkeys require a hostname, not an IP address; localhost is the local-development exception. Changing the hostname requires enrolling new passkeys. Changing the port or scheme requires updating the configured origin.

The exact configured origin is used for WebAuthn and browser write checks, including behind Caddy. No forwarded host is used to choose the relying party. HTTPS enables Secure session cookies; localhost HTTP uses HttpOnly, SameSite=Lax cookies without Secure.

## Recovery from the server console

If an account loses all sign-in methods:

```bash
npm run auth:manage -- recover you@example.com
```

For Docker, prefix the command with `docker compose --env-file .env.docker exec app`. Recovery prompts for a new hidden password, removes that account's passkeys, revokes all its sessions, and re-enables the account. It preserves inventory and other accounts. Enroll new passkeys after signing in. This is a privileged local-console operation; anyone who controls the server/database already controls the inventory.

For unattended test setup the CLI accepts `--password-stdin`; never place real passwords in command-line arguments or shell history.

## Operational limits

Authentication rate limits are persisted in SQLite. This small shared installation uses one server-wide bucket, including 10 password sign-in attempts per minute, rather than trusting client-supplied IP headers. A noisy client can temporarily exhaust that allowance for everyone. Restrict network reachability; this is not a public multi-tenant service. Account operations are owner-only and all inventory operations remain shared; the inventory activity history is not yet a per-user audit log.

Backups now include account credentials, sessions, and passkey public keys. Keep the database, photos, and environment secret private; use the restricted backup commands in the deployment guide. A restored database can restore sessions that were active when backed up: rotate the authentication secret or recover affected accounts when that is undesirable.

Implementation uses Better Auth 1.7.15 and its passkey plugin (SimpleWebAuthn). Password hashing, signed cookies, ceremony challenges, credential signatures, counters, and session issuance are handled by the library. The application additionally requires device verification, pins the origin/RP ID, limits the exposed auth endpoints, and guards each page/route handler.
