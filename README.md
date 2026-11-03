# Jeffventory

A local-first home inventory workbench for eBay sellers, electronics tinkerers, and people with one too many bins of useful things.

## Get started

Use a current Node.js LTS release (Node 24 recommended) and npm. The SQLite adapter needs native-module support.

```bash
npm ci
cp .env.example .env    # first setup only; keep your existing .env
npm run db:setup
npm run db:seed         # optional: two example items and starter categories/locations
npm run dev
```

Open http://127.0.0.1:3000. The server binds to loopback by default. This is a single-user application with no login; do not expose it to the public internet.

`db:setup` generates the Prisma client and applies committed migrations without clearing existing inventory. For a production-mode local server, run `npm run build` followed by `npm start`.

## Give Jeff a private Docker deployment

Docker Compose runs the production app without installing Node.js or a database on the host:

```bash
docker compose up -d --build
```

The default is http://127.0.0.1:3000, accessible only on that computer. SQLite and photos live together in a persistent Docker volume; migrations run automatically, and the container runs as a non-root user. Fresh installations start empty, not with someone else's inventory.

For Jeff's trusted home network, copy `docker/compose.env.example` to `.env.docker` and set the server's private LAN IP. The optional `compose.https.yaml` adds private HTTPS for phone-camera scanning without a public domain or cloud account. **Follow [Jeff's LAN setup guide](docs/DEPLOYMENT.md)** for the full commands, certificate trust, updates, and backup/restore.

This remains one shared inventory with no login: anyone who can reach the app can view, edit, export, or delete its contents. Keep it off public and guest networks. HTTPS encrypts traffic; it does not add user authentication.

## Inventory workflows

- **Find things:** search names, SKUs, product codes, manufacturers, model/part/serial numbers, tags, descriptions, and notes. Combine category/location filters with stock, listed, sold, archived, or low-stock views. Results are paginated; desktop has list and photo-grid layouts.
- **Add details once:** enter quantity, condition, storage location, component identifiers, tags, and private notes. New category and location names are created on save.
- **Photograph items:** choose, drag in, or capture JPEG/PNG/WebP photos. Up to 8 photos per item, 10 MB each. Photos are rotated, resized to fit 1600 px, re-encoded as WebP, and stripped of embedded metadata. The first photo is the inventory thumbnail. View, download, and delete photos from the item page.
- **Keep stock accurate:** add or subtract a chosen quantity with an optional note. Adjustments cannot drive stock below zero and are recorded in the item's activity history. An optional low-stock threshold makes depleted components easy to find.
- **Work in batches:** select items on the current page to move them, update status, export CSV, or print labels.
- **Add a similar item:** copy product details into a new record without copying the old SKU, serial number, photos, or selling status.

## Scanning and product information

`/scan` supports camera scanning, decoding a barcode photo, manual entry, and keyboard-style USB scanners. Camera use starts only after pressing **Start camera**. Camera frames and barcode photos are decoded in the browser, not uploaded to a scanning service.

Inventory SKUs are unique and resolve first. Product codes are not unique; items can share a UPC or an existing QR code. Leading zeros are preserved, and valid equivalent UPC/EAN/GTIN representations match the same product. Multiple matches are shown for selection. An unknown code pre-fills the new-item form.

**Look up product** in the item form is optional. Clicking it sends only the entered retail barcode to UPCitemdb's public trial API. Suggestions are previewed and **Fill empty fields** preserves anything you have already entered. Nothing is stored until the item is saved. The catalog may be incomplete or incorrect, and the trial service has rate limits; no match and service failures are shown separately. No API key is needed for the trial endpoint.

Phone cameras require trusted HTTPS, not an HTTP LAN address. The [private HTTPS deployment](docs/DEPLOYMENT.md#phone-camera-scanning-with-private-https) supports trusted devices on a home network; restrict network access because there is no app login. Manual entry and USB scanning remain available without camera access.

## Selling and labels

Each item includes an eBay listing helper: copy an 80-character title and a plain-text description, open a sold-listings search, or open eBay's listing-creation page. Private notes, serial numbers, and storage locations are excluded from the generated listing draft. Review the draft before posting; Jeffventory does not authenticate to eBay or publish listings.

All monetary amounts are **USD per unit**. Purchase price, asking price, sale price, marketplace fees, and shipping cost can be recorded. The what-if calculator subtracts cost, fees, and shipping from the sale/asking price; it is not an automatic eBay fee quote. Calculator changes are not persisted; use **Edit item** to save actual amounts.

Status applies to the whole inventory record. Marking an item sold does not decrement quantity or create an individual sales ledger. For partial sales, adjust stock and record the reason, or split distinct units into separate records. Archived and sold items are excluded from available-unit and asking-value totals.

Select items and choose **Print selected**, or print from an item page. Label options include 2 x 1, 2.6 x 1.3, and 4 x 2 inch layouts, QR or linear barcodes, inventory SKU or original product code, copies, and optional per-unit prices. Long/non-ASCII codes use QR to retain readability. Print up to 200 labels at once, at **100% / actual size**, with browser headers and footers disabled; try plain paper before label stock.

## Data and backups

Defaults, relative to the project root:

| Data | Location | Configuration |
| --- | --- | --- |
| SQLite inventory, photo metadata, activity | `prisma/dev.db` | `DATABASE_URL` |
| Processed photo files | `data/uploads/` | `UPLOAD_DIR` |

Database files, photos, local environment files, and browser-test artifacts are gitignored.

The **Your data** page exports inventory as CSV or versioned JSON. Inventory exports include private notes and serial numbers. CSV output protects spreadsheet cells from formula interpretation. Exports contain photo references, **not image binaries**, and are not full backups or an import format.

For a complete backup, stop the app and copy the database and the upload directory together. If SQLite `-wal` or `-shm` sidecar files remain, include them with the database. Use your configured paths if they differ from the defaults. Restore the database, any sidecars, and photo directory together while the app is stopped.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server, 127.0.0.1:3000 |
| `npm run build` | Generate Prisma client, production build, TypeScript check |
| `npm start` | Run the production build on loopback |
| `npm run lint` | ESLint |
| `npm run db:setup` | Generate client and apply existing migrations |
| `npm run db:migrate -- --name change_name` | Create/apply a development migration |
| `npm run db:seed` | Idempotent optional sample data |
| `npm run db:studio` | Inspect the database with Prisma Studio |
| `npm run test:unit` | Node test runner through tsx |
| `npm run test:e2e` | Build and run Playwright desktop/mobile workflows |
| `npm test` | Unit and browser suites |
| `docker compose up -d --build` | Build/start a persistent local production deployment |
| `npm run test:docker` | Build and exercise isolated HTTP/HTTPS containers, persistence, and backup/restore |

Install the test browser once:

```bash
npx playwright install chromium
```

Run one unit test:

```bash
npx tsx --test --test-name-pattern="retail codes" tests/codes.test.ts
```

Run one browser test:

```bash
npm run test:e2e -- --project=desktop -g "retrying a failed photo upload"
```

After an unchanged production build, skip rebuilding with `npx playwright test`. The browser suite starts a separate loopback server on port 3100 with a fresh database and photo directory under `.test-data/`, then removes that run's data. It does not use your inventory database. Set `PLAYWRIGHT_PORT` to an unused port if needed. Failures keep screenshots/traces in `test-results/`; `npx playwright show-trace <trace.zip>` opens a trace.

Docker smoke tests require a running Docker engine, Compose 2.24+ and the Playwright Chromium browser. They use random project names and ports, remove only their own volumes, and never use the normal deployment's data. After `docker compose build app`, `npm run test:docker -- --no-build` reuses `jeffventory:local`; `JEFFVENTORY_TEST_IMAGE` selects another existing image.

## Architecture

Next.js 16 App Router server components read Prisma directly. Client forms and controls call validated JSON or multipart route handlers. Prisma 7 uses the better-sqlite3 driver adapter and a generated TypeScript client. Photos are local files with database-backed identifiers, not user-supplied paths. ZXing decodes codes in the browser; bwip-js renders printable code PNGs on the server. Tailwind CSS 4 and shared CSS/component conventions provide the responsive dark workbench and separate white print layout.

See `.github/copilot-instructions.md` for implementation contracts and `AGENTS.md` for the bundled Next.js documentation requirement.

## Playwright MCP and Copilot

The workspace includes Microsoft Playwright MCP, pinned to `0.0.80`:

| Client | Configuration |
| --- | --- |
| Copilot CLI | `.mcp.json` |
| VS Code Copilot | `.vscode/mcp.json` |
| Copilot app run/setup buttons | `.github/github-app.yml` |

Copilot CLI discovers the project config in trusted Git repositories. If your client does not discover it automatically, launch from this folder with:

```bash
copilot --additional-mcp-config @.mcp.json
```

Approve workspace/server trust when your client prompts. In VS Code, open `.vscode/mcp.json` and start the `playwright` server. MCP uses installed Chrome; the regression suite uses the separately installed Playwright Chromium browser.

The MCP browser is headless with an isolated, in-memory profile and service workers blocked. Its origin filter allows only `localhost` and `127.0.0.1` on ports 3000 and 3100. Adjust both config files if you deliberately use different ports. The filter is a browsing convenience, **not a security boundary**; it does not constrain redirects. No user-global MCP settings are changed.

The Copilot app configuration provides manual setup/run/test actions and opens the local preview when the server is ready. Review and accept that configuration in the app before using the actions.
# jeffventory
