# Jeffventory — Copilot instructions

Home inventory app for eBay sellers and tinkerers: track items, scan UPC/QR codes with the camera, generate and print QR labels. Single-user, no auth, local SQLite.

## Commands

- `npm run dev` — dev server (Turbopack, port 3000)
- `npm run build` — production build; also runs the TypeScript check (use this to typecheck)
- `npm run lint` — ESLint (flat config, `next/core-web-vitals` + strict React hooks rules)
- `npx prisma migrate dev --name <name>` — create/apply migrations and regenerate the client
- `npx prisma generate` — regenerate client into `src/generated/prisma/` (gitignored; required after fresh clone before build)
- `npx prisma db seed` — runs `prisma/seed.ts` via tsx (configured in `prisma.config.ts`)
- There is no test framework set up yet.

## Versions that matter (newer than most training data)

- **Next.js 16** (App Router). `params` and `searchParams` are **Promises** — always `await` them. Pages use the generated typed helpers `PageProps<"/route/[param]">` / `LayoutProps<"/">` (globals, no import). Bundled docs live in `node_modules/next/dist/docs/` (see AGENTS.md); consult them before using unfamiliar Next APIs. Middleware is renamed `proxy.ts`.
- **Prisma 7**: CLI config lives in `prisma.config.ts` (loads `.env` via dotenv — Prisma no longer auto-loads it). Client is generated TypeScript (`prisma-client` generator) imported from `@/generated/prisma/client`, **not** `@prisma/client`. Runtime requires the driver adapter: `new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) })` — see `src/lib/db.ts` (singleton; always import `prisma` from there, except `prisma/seed.ts` which builds its own client with a relative import).
- **Tailwind CSS 4** — configured via `@import "tailwindcss"` + `@theme` in `src/app/globals.css`; there is no `tailwind.config.*`.
- ESLint enforces React Compiler-era hooks rules: e.g. no ref writes during render (sync refs inside `useEffect`, see `src/components/Scanner.tsx`).

## Architecture

- **Data flow**: server components query Prisma directly (list/detail pages); client components mutate through JSON API route handlers under `src/app/api/`. No server actions.
- **Schema** (`prisma/schema.prisma`): `Item` ↔ optional `Category`/`Location` (SetNull on delete). SQLite forbids Prisma enums, so `Item.status` / `Item.condition` are strings validated against the `STATUSES` / `CONDITIONS` constants in `src/lib/constants.ts` — keep schema comments, constants, and UI selects in sync when adding values.
- **Two code namespaces per item**:
  - `sku` (unique, e.g. `JV-8F3KQ2`) — internal ID encoded in printed QR labels; auto-generated in `src/lib/sku.ts` with a no-lookalike alphabet when the client omits it.
  - `upc` (non-unique) — the product's retail barcode; multiple items may share one.
- **Scan flow**: `Scanner.tsx` (@zxing/browser camera decode) → `GET /api/lookup?code=` which resolves SKU first, then UPC (returns `{match: "sku"|"upc"|null}`) → scan page routes to the item, a filtered list, or `/items/new?upc=` prefill.
- **Barcode rendering** is server-side only: `GET /api/barcode?text=&type=` returns PNG via bwip-js; `type=auto` picks upca/ean13/ean8/code128 by digit length (`pickBarcodeType` in `src/lib/sku.ts`). Pages embed plain `<img>` tags pointing at it (not `next/image`).
- **Labels**: `/labels?ids=a,b,c` renders fixed-size 2.6in×1.3in white cards (inline `style` for print accuracy) with QR of the SKU; printing is browser-native (`PrintButton` → `window.print()`, `print:hidden` utilities hide chrome).

## Conventions

- Import bwip-js as `import bwipjs from "bwip-js/node"` — the bare `"bwip-js"` specifier fails TypeScript resolution (its root export map has no condition TS matches under `moduleResolution: bundler`).
- SQLite + Prisma: no `mode: "insensitive"` on string filters (unsupported); plain `contains` is already case-insensitive for ASCII.
- API routes accept `categoryName`/`locationName` strings and `connectOrCreate` them — categories/locations are created implicitly, never picked by ID from clients. Forms offer them via `<datalist>`.
- Item create/update: empty-string numeric fields are coerced to `null`; blank SKU means "generate one"; Prisma error `P2002` → 409 (duplicate SKU), `P2025` → 404.
- Forms are uncontrolled (`defaultValue` + `FormData`), submitted as JSON via fetch, then `router.push` + `router.refresh()`.
- Dark theme is hard-coded (zinc palette); label cards force white/black for printing.
- DB file is `prisma/dev.db` (gitignored along with `.env`); `DATABASE_URL` paths resolve from the project root.
