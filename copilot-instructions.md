# Copilot instructions — Inventory

Place at `.github/copilot-instructions.md`. These conventions are load-bearing;
ARCHITECTURE.md, DESIGN.md, and PHASES.md in the repo root are authoritative.

## Hard rules
- **Never introduce NPM, node, or a frontend build step.** No package.json,
  no bundlers, no React/Vue/Svelte, no Tailwind CLI. JavaScript is limited
  to vendored single files in `app/static/` (currently htmx.min.js only).
  If a feature seems to need a JS library, stop and flag it instead.
- **Never put business logic in route modules.** Logic goes in
  `app/services/`; `routes/web/` and `routes/api/` are thin wrappers that
  handle auth + serialization only. Both must call the same service function.
- **Do not build deferred features** (see PHASES.md "Explicitly deferred"),
  even as stubs, even if they seem easy.
- **Do not add an "age" column** — age is computed from acquired_date.
- **Do not replace session-cookie auth with JWT** on web routes, and do not
  add OAuth anywhere.
- Schema changes only via Alembic migrations; never edit applied migrations.

## Conventions
- Python 3.12, FastAPI, SQLAlchemy 2.x async style, type hints everywhere,
  ruff for lint/format.
- Jinja2 templates: full pages in `templates/`, HTMX-swappable fragments in
  `templates/partials/`. Web POST handlers return partials, not redirects,
  unless it's a full-page navigation.
- HTMX patterns: `hx-post`/`hx-get` + `hx-target` + `hx-swap`; prefer
  returning the smallest fragment that changed. No inline `<script>` blocks.
- CSS: one hand-written `app.css`, custom properties for theming, flexbox
  and grid, mobile-responsive by default. No CSS frameworks.
- Tests: pytest, httpx AsyncClient against the app, real Postgres via the
  compose test service (no SQLite substitution — we use text[], enums,
  pg_trgm).
- Secrets/config: environment variables with working defaults; the only
  required one is POSTGRES_PASSWORD.
- Commit style: conventional commits (feat:, fix:, chore:, test:).

## Testing rules
Tests exist to prove the user-visible outcome, not to turn CI green.

- **A status code is never a sufficient assertion.** Every test must assert
  at least one substantive outcome: the rendered fragment contains the
  expected data, the database row exists with the expected values, the
  side effect occurred (photo file written, token revoked, quantity
  incremented). `assert response.status_code == 200` alone is a failing
  review.
- **Test the flow, not the endpoint.** For each user-facing feature, at
  least one test walks the real sequence the user performs. Example: scan
  unknown code → choose create → submit form → scan same code again →
  assert the item card returns with the entered name. Round-trip
  (write-then-read-back) beats write-then-assert-200.
- **HTMX endpoints are tested on their HTML.** Parse or string-match the
  returned partial for the actual data (names, quantities, breadcrumbs) —
  not just "response is non-empty."
- **Never weaken a test to make it pass.** If a test fails, the default
  assumption is the code is wrong. Loosening an assertion, deleting a
  test, or marking xfail/skip requires an explicit comment explaining why
  the original expectation was incorrect — and is a decision to surface,
  not make silently.
- **Zero tolerance for errors and warnings in test output.** Configure
  pytest with `filterwarnings = ["error"]` so warnings fail the run. No
  blanket suppressions; a suppression must name the specific warning,
  cite why it is unfixable, and link the upstream issue. No bare
  `except:`/`except Exception: pass` anywhere — swallowed errors are
  treated as bugs. Tracebacks or ERROR-level log lines appearing during a
  passing test run are defects to fix before proceeding.
- **Phase acceptance criteria become tests.** Each "Accept when" line in
  PHASES.md maps to at least one automated test where feasible; where it
  can't be automated (e.g., printed label scans correctly), note the
  manual check in the phase's PR description.

## When uncertain
Prefer the boring server-rendered solution. If a change conflicts with
ARCHITECTURE.md's guiding constraints, surface the conflict rather than
working around it.
