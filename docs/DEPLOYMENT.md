# Jeff's private LAN setup

Jeffventory runs on one always-on computer, server, or NAS with Docker. Other trusted devices use its browser interface. No public hosting, public domain, cloud account, or separate database server is needed.

**This is a shared household inventory with owner-managed accounts.** Every enabled account can view, edit, export, and delete inventory; only the owner manages access. Keep it on a trusted network, block guest/untrusted devices, and do not configure router port forwarding, public tunnels, or public proxies. Passwords and passkeys require the setup below; see [authentication and recovery](AUTHENTICATION.md).

## What Jeff needs

- Docker Desktop using Linux containers, or Docker Engine on Linux.
- Docker Compose 2.24 or newer (`docker compose version`).
- This project folder, including `Dockerfile`, the Compose files, `docker/`, and the source.
- A stable private LAN address for the server, preferably a DHCP reservation.

There is no host Node.js, npm, Prisma, or SQLite installation to maintain. The first build downloads base images, packages, and fonts. Inventory works without the internet after installation; product lookup and eBay links are optional online features.

The commands below use a Bash-compatible terminal: macOS Terminal, Linux, or WSL on Windows. Use WSL for the binary backup/restore redirections; older Windows PowerShell versions can corrupt archives passed through `>` or `<`.

## First launch on the server

From the project folder:

```bash
cp docker/compose.env.example .env.docker
# Generate a secret with openssl rand -hex 32 and put it in BETTER_AUTH_SECRET.
# Keep BETTER_AUTH_URL=http://localhost:3000 for this local-only launch.
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker exec app npm run auth:manage -- create-owner
docker compose --env-file .env.docker ps
```

Open http://localhost:3000 on that computer and sign in. The account command prompts for a hidden password. A fresh deployment is empty. The build excludes the developer's `.env`, database, photos, backups, and certificates.

Startup applies existing database migrations before accepting requests. It never runs a reset or seeds example inventory. The app runs as user 1000, restarts unless deliberately stopped, and reports healthy only when it can query its migrated database.

If port 3000 is already used by a development server, stop that server or choose a different published port below.

## Allow trusted LAN devices

Keep your existing `.env.docker` and secret. Configure local DNS so `inventory.home.arpa` resolves to the server's private IP. Edit the settings, replacing the example IP with the actual address:

```dotenv
JEFFVENTORY_BIND_ADDRESS=192.168.1.50
JEFFVENTORY_PORT=3000
JEFFVENTORY_HOSTNAME=inventory.home.arpa
JEFFVENTORY_HTTPS_PORT=8443
BETTER_AUTH_URL=https://inventory.home.arpa:8443
```

Use the server's LAN IP rather than `0.0.0.0`, which publishes on every interface. Restrict Docker's published ports to trusted devices with the host/router's network controls. Only open the chosen port on the private network; do not open it on the router's internet-facing side.

LAN access requires trusted HTTPS. Plain HTTP is allowed only for localhost/loopback. Passkeys require a stable hostname; IP-address relying parties are unsupported. Continue with the HTTPS setup below.

## Phone-camera scanning with private HTTPS

The optional Caddy container issues certificates from its own local certificate authority. It does not request public certificates or need access from the internet.

With `.env.docker` configured as above:

```bash
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml up -d --build
```

This removes the app's direct HTTP port and publishes only HTTPS on the selected interface. Open `https://inventory.home.arpa:8443`. The first visit will not be trusted until the device trusts the local CA.

Export the **public** CA certificate:

```bash
mkdir -p certs
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml \
  cp https:/data/caddy/pki/authorities/local/root.crt certs/jeffventory-root.crt
```

Transfer that certificate to each trusted device using a trusted method, then install it:

- **iPhone/iPad:** install the downloaded profile in Settings, then enable full trust under General > About > Certificate Trust Settings.
- **Android:** use the device's security settings to install a CA certificate; menu names vary. Restart the browser afterward.
- **macOS:** import into Keychain Access and trust it for SSL.
- **Windows:** import into the current user's Trusted Root Certification Authorities store.
- **Firefox:** its certificate settings may need a separate import, depending on platform and policy.

Trust only the certificate exported from your own server. **Never share Caddy's private keys or its certificate-volume backup.** The browser should show a valid HTTPS connection before granting camera access; clicking through a certificate warning is not a substitute for trust.

`JEFFVENTORY_HOSTNAME` must match the hostname typed into the browser and the hostname in `BETTER_AUTH_URL`. Configure your router/local DNS to resolve it to the server IP. Do not include a scheme or port in that setting. A hostname such as `jeffventory.home.arpa` is fine if you configure local DNS; Docker does not create that DNS record for you.

Caddy's CA is stored in a persistent volume, so ordinary restarts and image updates do not require trusting a new certificate.

## Day-to-day operation and updates

Use the same `.env.docker` and Compose files each time. These examples use HTTPS; omit `-f compose.yaml -f compose.https.yaml` for HTTP-only installations.

```bash
# Status and recent logs
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml ps
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml logs --tail=100 app https

# Stop without deleting inventory
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml stop

# Start the stopped deployment
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml start
```

Back up before updating. Replace the application source with the new release while keeping `.env.docker` and the same Compose project name. Then:

```bash
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml build --pull app
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml pull https
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml up -d
```

Updates apply committed migrations to the existing database. Do not run multiple application containers against the same SQLite file. Do not place SQLite on an SMB/NFS share; use Docker storage backed by a local filesystem.

`docker compose down` removes containers but retains named volumes. **Do not use `docker compose down --volumes`, `docker volume prune`, or delete the inventory volume on a real installation.** Those operations can destroy inventory.

## Back up the complete installation

The app stores `/data/inventory.db`, any SQLite sidecars, and `/data/uploads/` together in the `inventory` volume. The default Compose project is `jeffventory`; changing the project name selects a different set of volumes.

Stop all writers before copying. The following creates both an inventory archive and a private CA archive without changing their contents:

```bash
(
set -e
umask 077
mkdir -p backups
chmod 700 backups
backup=$(mktemp -d "backups/$(date +%Y%m%d-%H%M%S)-XXXXXX")

docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml stop
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml \
  run --rm -T --no-deps --entrypoint tar app -C /data -czf - . \
  > "$backup/inventory.tgz"
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml \
  run --rm -T --no-deps --entrypoint tar https -C /data -czf - . \
  > "$backup/certificates.tgz"
docker compose --env-file .env.docker -f compose.yaml -f compose.https.yaml start

tar -tzf "$backup/inventory.tgz"
tar -tzf "$backup/certificates.tgz"
)
```

For HTTP-only installs, omit the HTTPS Compose file and the certificate archive. If a command fails, resolve it before treating the backup as usable; restart the app after the attempted backup when safe.

The subshell creates private directories and files (0700/0600), including on hosts with a permissive default umask. The inventory database now also contains password hashes, sessions, and passkey records. Keep an encrypted/off-machine copy of both archives, `.env.docker` (including the authentication secret), and the application release. The certificate archive contains private signing keys; treat it as sensitive. JSON/CSV exports are useful for spreadsheets but **do not include photos and are not a full backup**.

## Restore without overwriting the current installation

Keep the old installation and volumes until the restoration is confirmed. Stop the old deployment so it releases its ports. On a new server, build the app image first with `docker compose --env-file .env.docker build app`.

Choose a new Compose project name, such as `jeffventory-restored`. The following refuses to replace an existing database or CA private key:

```bash
backup="backups/REPLACE-WITH-YOUR-BACKUP-DIRECTORY"

docker compose --env-file .env.docker -p jeffventory-restored \
  -f compose.yaml -f compose.https.yaml \
  run --rm -T --no-deps --entrypoint sh app \
  -c 'test ! -e /data/inventory.db && tar -xzf - -C /data' \
  < "$backup/inventory.tgz"

docker compose --env-file .env.docker -p jeffventory-restored \
  -f compose.yaml -f compose.https.yaml \
  run --rm -T --no-deps --entrypoint sh https \
  -c 'test ! -e /data/caddy/pki/authorities/local/root.key && tar -xzf - -C /data' \
  < "$backup/certificates.tgz"

docker compose --env-file .env.docker -p jeffventory-restored \
  -f compose.yaml -f compose.https.yaml up -d --no-build
```

Open an item and its photos, check quantities, and export the inventory before declaring restoration complete. Continue using `-p jeffventory-restored` for later management commands; otherwise you will address the original installation.

If you do not restore the CA archive, Caddy generates a new CA and every client must trust its new root certificate.

## Moving existing non-Docker inventory

Jeff should normally start with an empty installation. If deliberately transferring an existing inventory instead, stop its server first and stage:

```text
inventory.db
inventory.db-wal       # only if it exists
inventory.db-shm       # only if it exists
inventory.db-journal   # only if it exists
uploads/
```

Copy the configured SQLite database (normally `prisma/dev.db`) as `inventory.db`, rename any sidecars to match, and copy the configured upload directory. Archive that folder's contents and use the inventory-restore procedure above. Do not copy a live database or restore photo metadata without its photo files.

Do not send `.env`, databases, uploads, backups, private certificates, `node_modules`, or `.next` as part of the application source handoff.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Docker cannot connect | Start Docker Desktop or the Docker service. |
| Published address unavailable | Use an IP assigned to this server, not the phone's address. Reserve it in DHCP. |
| Port already allocated | Stop the other server or change the published port in `.env.docker`. |
| Phone camera unavailable | Use the HTTPS address, install/trust the correct CA, and allow camera permission. Image/manual/USB scanning remain available. |
| Browser write rejected as cross-origin | Keep the browser hostname/port consistent. An additional proxy must preserve `Host` and send the correct `X-Forwarded-Proto`. |
| Storage permission error | The app runs as UID 1000. Use the supplied named volume; an administrator-provided bind mount must be writable by that user. |
| Inventory appears empty after moving folders | Check the Compose project name and inventory volume. Do not seed or overwrite data to troubleshoot. |
| Container unhealthy | Inspect `app` logs. `/api/health` returns 503 if the migrated database cannot be queried. |
| Caddy cannot load configuration | Use the included Caddyfile, matching image version, and Compose 2.24+ for the `!reset` port override. |
