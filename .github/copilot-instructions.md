# Jeffventory — Copilot instructions

Home inventory app for eBay sellers and tinkerers: photos, component details, stock history, UPC/QR scanning, seller drafts, and printable labels. Single-user, local SQLite and photo files. Dev/start scripts bind to loopback because the app has no login.

## Commands

- Fresh checkout: `npm ci`, copy `.env.example` to `.env`, then `npm run db:setup`. Optional `npm run db:seed` adds examples without replacing existing records.
- `npm run dev` — dev server (Turbopack, 127.0.0.1:3000)
- `npm run build` — regenerate Prisma client, production build, and TypeScript check
- `npm start` — serve the production build on loopback
- `npm run lint` — ESLint (flat config, `next/core-web-vitals` + strict React hooks rules)
- `npm run db:setup` — generate client and apply committed migrations; does not reset data
- `npm run db:migrate -- --name <name>` — create/apply a development migration; run `npx prisma generate` afterward
- `npx prisma generate` — regenerate client into `src/generated/prisma/` (gitignored; required after fresh clone before build)
- `npm run db:seed` — runs `prisma/seed.ts` via tsx (configured in `prisma.config.ts`)
- `npm run test:unit` — Node's test runner through tsx; one test: `npx tsx --test --test-name-pattern="retail codes" tests/codes.test.ts`
- `npm run test:e2e` — build + Playwright. Install the browser once with `npx playwright install chromium`. One scenario: `npm run test:e2e -- --project=desktop -g "retrying a failed photo upload"`.
- `npx playwright test` — rerun against an unchanged existing production build. `playwright.config.ts` starts `scripts/e2e-server.ts` on 3100 (override with `PLAYWRIGHT_PORT`), using a fresh temporary database/upload directory. Keep tests off `prisma/dev.db`.
- `.mcp.json` (Copilot CLI) and `.vscode/mcp.json` configure the same pinned Playwright MCP process. Clients must trust the workspace/server; explicit CLI loading is `copilot --additional-mcp-config @.mcp.json`. `.github/github-app.yml` supplies manual setup/run/test buttons.
- `docker compose up -d --build` — local production deployment. For LAN/HTTPS, use `.env.docker` and `compose.https.yaml` as described in `docs/DEPLOYMENT.md`; defaults publish only to loopback.
- `npm run test:docker` — Docker/Compose and Playwright Chromium required. Builds isolated deployments on random ports, verifies persistence, backup/restore, and local-CA HTTPS, then deletes only its own test volumes. `-- --no-build` reuses `jeffventory:local` (or `JEFFVENTORY_TEST_IMAGE`).

## Versions that matter (newer than most training data)

- **Next.js 16** (App Router). `params` and `searchParams` are **Promises** — always `await` them. Pages use the generated typed helpers `PageProps<"/route/[param]">` / `LayoutProps<"/">` (globals, no import). Bundled docs live in `node_modules/next/dist/docs/` (see AGENTS.md); consult them before using unfamiliar Next APIs. Middleware is renamed `proxy.ts`.
- **Prisma 7**: CLI config lives in `prisma.config.ts` (loads `.env` via dotenv — Prisma no longer auto-loads it). Client is generated TypeScript (`prisma-client` generator) imported from `@/generated/prisma/client`, **not** `@prisma/client`. Runtime requires the driver adapter: `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })` — see `src/lib/db.ts` (singleton; always import `prisma` from there, except `prisma/seed.ts` which builds its own client with a relative import).
- **Tailwind CSS 4** — configured via `@import "tailwindcss"` + `@theme` in `src/app/globals.css`; there is no `tailwind.config.*`.
- ESLint enforces React Compiler-era hooks rules: e.g. no ref writes during render (sync refs inside `useEffect`, see `src/components/Scanner.tsx`).

## Architecture

- **Data flow**: server components query Prisma directly (list/detail pages); client components mutate through JSON API route handlers under `src/app/api/`. No server actions.
- **Schema** (`prisma/schema.prisma`): `Item` has optional `Category`/`Location` (SetNull on delete), `ItemPhoto` metadata, and `ItemActivity` history. Status and condition are stored as strings; validate with `STATUSES` / `CONDITIONS` in `src/lib/constants.ts`, and keep API validation, filters, badges, and selects in sync.
- **Two code namespaces per item**:
  - `sku` (unique, e.g. `JV-8F3KQ2`) — internal ID encoded in printed QR labels; auto-generated in `src/lib/sku.ts` with a no-lookalike alphabet when the client omits it.
  - `upc` (non-unique) — a retail barcode or existing external QR text; multiple items may share one. Never parse codes as numbers.
- **Inventory queries**: server page and JSON/export routes share `buildItemWhere` / `buildItemOrderBy` in `src/lib/inventory-query.ts`. The UI paginates 48 records; selection/bulk actions apply to the current page. Whole-inventory totals are independent of filters.
- **Scan flow**: camera, image, manual, or USB input → `GET /api/lookup?code=` → SKU first, then product-code candidates (`src/lib/codes.ts` normalizes valid UPC/EAN leading-zero equivalents). A single match opens the item, multiple matches are selectable, no match pre-fills `/items/new?upc=`. Lookup failures must never appear as "not found." Camera streams stop on unmount and after decode.
- **Product suggestions**: `GET /api/products/lookup?code=` contacts UPCitemdb only after an explicit user click. Validate external JSON. The form previews suggestions and fills only blank fields; never automatically send inventory/photos, import remote images, or overwrite user edits.
- **Photos**: multipart `files` at `/api/items/[id]/photos`, max 8 per item / 10 MB each. Sharp verifies/re-encodes JPEG/PNG/WebP to WebP, removes metadata, and fits within 1600px. `/api/photos/[id]` resolves database identifiers to generated local filenames. `UPLOAD_DIR` defaults to `data/uploads`; never trust original names as filesystem paths. First photo by createdAt/id is the cover.
- **Stock and history**: `/api/items/[id]/quantity` applies an atomic signed delta and records activity; stock must not go negative under concurrent requests. Bulk status/location updates at `/api/items/bulk` are all-or-nothing. Editing an item also records history.
- **Barcode rendering**: `GET /api/barcode?text=&type=` returns PNG via `bwip-js/node`. `pickBarcodeType` uses retail symbologies only when the GTIN checksum is valid; invalid numeric strings must retain their exact contents via Code 128, not have a check digit silently replaced. Long/non-ASCII codes use QR. Plain `<img>` tags intentionally avoid Next image optimization.
- **Labels**: `/labels?ids=a,b,c` supports template, code source/style, copies, and price controls. Physical dimensions are inches; QR quiet zones and print CSS matter. `PrintButton` waits for all images to decode before calling `window.print()`. Limit batches to 200.
- **Selling**: amounts are USD per unit. Status describes the entire record; marking SOLD does not decrement stock. `src/lib/selling.ts` calculates in cents and builds an 80-character title/plain-text draft without private notes, serial numbers, or storage locations. Calculator changes are explicitly ephemeral; eBay links do not publish listings.
- **Exports**: `/api/export?format=csv|json` uses the same filters or explicit IDs. CSV must neutralize formula cells; JSON is versioned metadata, not a photo-inclusive backup. Full backups require the stopped database (including any remaining sidecars) and upload directory together.
- **Private deployment**: Docker sets `JEFFVENTORY_STANDALONE=1` only during the build; normal `npm start` stays unchanged. The non-root runtime applies `prisma migrate deploy` before starting and stores SQLite/photos together under `/data`. Prisma CLI and dotenv are runtime dependencies for migrations. `/api/health` checks the migrated database without returning inventory. The optional Caddy overlay uses a persistent local CA and removes the app's direct HTTP port; no public certificate service is involved.

## Conventions

- Import bwip-js as `import bwipjs from "bwip-js/node"` — the bare `"bwip-js"` specifier fails TypeScript resolution (its root export map has no condition TS matches under `moduleResolution: bundler`).
- SQLite + Prisma: no `mode: "insensitive"` on string filters (unsupported); plain `contains` is already case-insensitive for ASCII.
- Item mutations accept `categoryName`/`locationName` strings with `connectOrCreate`; filters use IDs. Forms offer names via `<datalist>`. Clearing a relationship on edit disconnects it.
- Parse JSON input as unknown before validation. Quantities/thresholds are whole nonnegative numbers; prices must be finite and nonnegative. Optional empty numeric fields become null. Create with blank SKU generates one; duplicate SKU is 409 and missing records are 404.
- Codes are trimmed at the boundaries and capped at 512 characters across storage, scanning, and image generation. Preserve their leading zeros and internal text.
- Origin checks use the actual `Host` header: NextURL normalizes loopback addresses to `localhost`, so comparing browser Origin directly against `request.url` rejects legitimate requests to `127.0.0.1`.
- LAN deployment is one shared inventory, not multi-user authorization. Anyone with network access can edit/delete/export it. Never publish ports on all interfaces by default or add public tunnels. Phone-camera HTTPS requires each client to trust the private CA; HTTPS alone does not provide a login.
- Forms are uncontrolled (`defaultValue` + `FormData`) and use `fetchJson` / `jsonRequest` from `src/lib/client-api.ts`. Navigate with `router.push` + `router.refresh()` after successful mutation. An item saved before a photo failure retains its ID/SKU so retrying cannot create a duplicate.
- UI tokens and shared control/layout classes live in `src/app/globals.css`; `Icon.tsx` supplies consistent line icons. The established dark green/charcoal workbench becomes a stacked layout with photo rows on phones. Keep visible labels, keyboard focus, error/retry states, and white print styles when adding controls.
- DB and photo paths resolve from the project root; both can be overridden for tests. `.env.example` is tracked; actual databases, uploads, `.env`, `.test-data`, test reports, and `.playwright-mcp/` snapshots/logs are ignored.
