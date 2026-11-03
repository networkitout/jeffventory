> **Historical proposal — superseded.** This document describes an unimplemented Python/Postgres design, not the current application. Its implementation directives are obsolete. Use [README.md](README.md), [.github/copilot-instructions.md](.github/copilot-instructions.md), and [authentication documentation](docs/AUTHENTICATION.md) for the current Next.js/Prisma/SQLite system.

# Inventory — Architecture

**Status:** Accepted
**Last updated:** 2026-08-09

A self-hosted inventory management application for home use. Single-household
deployment; multiple deployments (one per household) rather than multi-tenancy.
Designed to be forked-and-run by a non-expert: `docker compose up` and a
first-run setup page, no manual pre-configuration.

## Guiding constraints (do not violate)

1. **No NPM / no frontend build step.** No node, no bundler, no package.json.
   All JavaScript is vendored as single static files in `app/static/`
   (htmx.min.js, and nothing else in v1). The UI is server-rendered Jinja2
   with HTMX for interactivity. Hand-written CSS in one file.
2. **API-first service layer.** All business logic lives in `app/services/`.
   Route modules are thin wrappers: `routes/web/` returns Jinja2/HTMX
   partials with session-cookie auth; `routes/api/` returns JSON under
   `/api/v1/` with bearer-token auth. A future iOS companion app consumes
   `/api/v1/` — never let logic accumulate in the web routes.
3. **Zero-config deploy.** Auto-run migrations on container start (alembic
   upgrade head, gated on Postgres healthcheck). First-run setup page creates
   the admin account when the users table is empty. The only environment
   variable is POSTGRES_PASSWORD, and it has a working default.
4. **Scope discipline.** v1 is CRUD + one scan flow. Explicitly OUT of scope:
   stock ledger / audit trail, check-in/check-out, multi-tenancy, browser
   camera scanning, the iOS app itself. Do not implement these.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Python 3.12, FastAPI, uvicorn | Async, OpenAPI docs for free (the iOS API contract) |
| Templates | Jinja2 + HTMX | Server-rendered, no build step |
| DB | PostgreSQL 16 | text[] tags with GIN index, gen_random_uuid() |
| ORM/migrations | SQLAlchemy 2.x (async) + Alembic | Auto-migrate on startup |
| Auth (web) | Session cookies, argon2-cffi hashing | No JWT ceremony for server-rendered pages |
| Auth (API) | Bearer device tokens | Paired via QR code shown in web UI |
| QR generation | segno | Pure Python, zero deps |
| Barcode generation | python-barcode | Pure Python |
| Images | Pillow (thumbnails on upload) | Files on a docker volume, not in Postgres |
| Deploy | Ubuntu 24.04, Docker + docker compose | app + postgres (+ optional caddy) |

## Key decisions and why

### Codes are decoupled from items
Scanned codes may be pre-existing (EAN-13 on a product box, a vendor's
Code128, arbitrary QR payloads) or newly generated. The code value is
therefore arbitrary text the system doesn't control, so it is NOT the item
primary key. Items use UUID PKs; an `item_codes` table maps code values to
items. One item can carry multiple codes (original sticker + our label).

### Scan capture paths
- **v1 web:** a persistent auto-focused input on the scan page. USB
  keyboard-wedge scanners type the code + Enter into it. Manual typing works
  identically. No JavaScript required for capture.
- **Future iOS app:** native VisionKit DataScannerViewController posting to
  `/api/v1/scan`. This is why browser camera scanning (and its HTTPS
  requirement on LAN) is out of scope — the phone app does it better.

### Quantity is a plain integer
`quantity int not null default 1`. Steppers (+/-) and a set-to field in the
UI. A "+1 on scan" toggle on the scan page for restocking. NO adjustment
ledger, NO transaction history — that is deliberate scope control.

### Age is derived, not stored
Store `acquired_date`; compute age at render time. Never store an age field.

### Tags are text[]
Postgres `text[]` column with a GIN index, filtered with `@>`. No join
table, no tag-management UI in v1.

### Users and onboarding
All users in one deployment see the same inventory (it's a household).
Roles: admin / editor / viewer (enum column). Admin generates single-use
invite-link tokens; invitees set their own passwords. First-run setup page
bootstraps the first admin.

### Device pairing for the API
`device_tokens` table: token hash, user_id, device name, created_at,
last_seen. Web UI renders a pairing QR containing a fresh token; a phone
scans it to authenticate. Tokens are revocable from the web UI.

### Photos
Multiple photos per item (`item_photos` table, files on a volume under
`/data/photos/`). Thumbnails generated with Pillow at upload time. Served
by FastAPI with auth check (photos are not public static files).

### Data export
CSV export of the current filtered item view. No direct Postgres exposure.

## Container topology

```
compose.yaml
├── app        python:3.12-slim; entrypoint: wait-for-db → alembic upgrade head → uvicorn
├── postgres   postgres:16; volume pgdata; healthcheck pg_isready
└── caddy      OPTIONAL, disabled by default (only needed if browser camera
               scanning is ever added; delete for v1)
```

Volumes: `pgdata` (database), `appdata` (photos, generated labels).

## Consequences

- Easier: iOS app later (API + OpenAPI docs already exist); friend's
  deployment (compose up, setup page); reasoning about auth (two simple
  mechanisms, no OAuth).
- Harder: if shared-instance multi-tenancy is ever wanted, it's a
  `household_id` migration across the schema (accepted risk — schema is
  normalized enough that this is a migration, not a rewrite).
- Revisit later: browser camera scanning + TLS, stock ledger, Metabase or a
  read-only DB role if ad-hoc SQL is ever requested.
