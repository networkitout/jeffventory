# Jeffventory

Home inventory for eBay sellers and tinkerers. Track items, scan UPC/EAN barcodes and QR labels with your camera, and design/print QR shelf labels.

## Features

- **Inventory CRUD** — name, SKU, UPC, quantity, condition, status (in stock / listed / sold / archived), prices, eBay URL, category, location, notes
- **Camera scanning** (`/scan`) — point at a product UPC/EAN or a printed Jeffventory QR label; known codes jump straight to the item, unknown UPCs pre-fill a new item
- **Label printing** (`/labels?ids=…`) — 2.6″×1.3″ QR labels with name, SKU, location, and price; print from the browser
- **Barcode generation** (`/api/barcode`) — server-rendered PNG QR codes, UPC-A/EAN-13/EAN-8, and Code 128
- **Search & filters** — free-text across name/SKU/UPC/notes plus status/category/location filters

## Quick start

```bash
npm install
npx prisma migrate dev   # create prisma/dev.db and generate the client
npx prisma db seed       # optional sample data
npm run dev
```

Open http://localhost:3000. Camera scanning requires localhost or HTTPS.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build + typecheck |
| `npm run lint` | ESLint |
| `npx prisma migrate dev` | Apply/create migrations |
| `npx prisma db seed` | Seed sample data |
| `npx prisma studio` | Browse the database |

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Prisma 7 + SQLite (better-sqlite3 adapter) · @zxing/browser (scanning) · bwip-js (barcode generation)
