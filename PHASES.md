# Inventory — Implementation Phases

Build in this order. Each phase ends in a runnable, demonstrable state.
Do not start a phase until the previous phase's acceptance criteria pass.
Write tests alongside each phase (pytest + httpx AsyncClient), not at the end.

## Phase 0 — Skeleton & deploy loop
Scaffold the repo, compose.yaml, Dockerfile, entrypoint (wait-for-db →
alembic upgrade head → uvicorn), empty FastAPI app with /healthz, base
Jinja2 layout, vendored htmx.min.js, app.css.

**Accept when:** `docker compose up` on a clean machine reaches a styled
"hello" page; `docker compose down && up` is idempotent; healthcheck green.

## Phase 1 — Schema & models
Full schema from DESIGN.md §1 as the initial Alembic migration (including
pg_trgm extension). SQLAlchemy models. Seed script for dev data.

**Accept when:** migration applies from zero on container start; models
round-trip in a pytest against a throwaway Postgres.

## Phase 2 — Auth (web)
First-run setup page, login/logout, session middleware, argon2 hashing,
role enforcement dependency (admin/editor/viewer), invite-link generation
and redemption, user management screen.

**Accept when:** fresh install forces setup → admin exists → invite URL
creates an editor who can log in; viewer role cannot reach edit endpoints
(403); all covered by tests.

## Phase 3 — Items CRUD (web)
Items list with filters (search/category/location/tags), item detail with
inline HTMX edits, quantity steppers, locations tree management,
categories management, CSV export of current filter.

**Accept when:** UX quality bar items 2–4 from DESIGN.md §4 pass with
seeded data; export opens correctly in Excel/Numbers.

## Phase 4 — Scan flow (web)
/scan page per DESIGN.md §3: auto-focused input, lookup vs +1 modes,
known-code card swap, unknown-code chooser (create with sticky defaults /
attach with trigram search), refocus-and-clear after every action.

**Accept when:** UX quality bar item 1 passes — a full shelving session
(scan 5 unknown codes, create 5 items) is completable with keyboard +
scanner only; +1 mode increments on repeat scans.

## Phase 5 — Photos
Multi-photo upload on item detail, Pillow thumbnails at upload, gallery
with reorder/delete, authenticated photo serving from the appdata volume.

**Accept when:** phone-browser upload works; list views show thumbnails
with no visible latency regression; photos survive container recreation.

## Phase 6 — Labels
segno QR generation, python-barcode Code128, per-item label view, print
sheet (Avery 5160 + 22806 CSS grid), auto-generate `inv:{uuid4}` codes for
unlabeled items on demand.

**Accept when:** a printed 5160 sheet scans correctly with a USB scanner
and resolves to the right items.

## Phase 7 — JSON API & device pairing
`/api/v1` per DESIGN.md §2 as thin wrappers over the same services the web
routes use. Bearer-token auth dependency. Pairing flow (web QR → POST
/api/v1/pair). Device management screen (list/revoke).

**Accept when:** every endpoint in the contract exists and is exercised by
tests; OpenAPI docs render at /api/v1/docs; a revoked token 401s; scanning
the pairing QR payload with curl yields a working bearer token.

## Phase 8 — Polish & release
Empty states (DESIGN.md §4.5), error pages, README with the two-command
install (clone, compose up), backup notes (pg_dump + photos volume),
version tag v1.0.

**Accept when:** a person who has never seen the project deploys it from
the README on a clean Ubuntu 24.04 VM in under 10 minutes.

## Explicitly deferred (do not build in v1)
Browser camera scanning, TLS/caddy, stock ledger / audit history,
check-in/check-out, multi-tenancy, PDF label export, Metabase/read-only DB
role, the iOS app.
