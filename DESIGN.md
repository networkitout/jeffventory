# Inventory — Design

Companion to ARCHITECTURE.md. This is the buildable spec: schema, API
surface, and UX flows. Where this document and generated code disagree,
this document wins until it is amended.

## 1. Data model

```sql
-- users & auth ----------------------------------------------------------
create type user_role as enum ('admin', 'editor', 'viewer');

create table users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,              -- argon2
  role          user_role not null default 'editor',
  created_at    timestamptz not null default now()
);

create table invites (
  token_hash  text primary key,
  role        user_role not null default 'editor',
  created_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create table device_tokens (
  token_hash  text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  device_name text not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

-- inventory -------------------------------------------------------------
create table categories (
  id   serial primary key,
  name text not null unique
);

create table locations (
  id        serial primary key,
  name      text not null,
  parent_id int references locations(id) on delete set null,
  coord_x   text,          -- freeform: row / bay / aisle
  coord_y   text,          -- freeform: shelf
  coord_z   text,          -- freeform: bin / position
  unique (name, parent_id)
);

create table items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  category_id   int references categories(id) on delete set null,
  location_id   int references locations(id) on delete set null,
  quantity      int not null default 1 check (quantity >= 0),
  acquired_date date,                       -- age is DERIVED from this
  value         numeric(12,2),
  vendor        text,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index items_tags_gin on items using gin (tags);
create index items_name_trgm on items using gin (name gin_trgm_ops); -- pg_trgm for search

create table item_codes (
  code_value  text primary key,             -- exactly as scanned
  symbology   text not null default 'unknown', -- 'qr'|'ean13'|'code128'|'unknown'
  item_id     uuid not null references items(id) on delete cascade,
  assigned_at timestamptz not null default now()
);
create index item_codes_item_idx on item_codes(item_id);

create table item_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references items(id) on delete cascade,
  filename   text not null,                 -- under /data/photos/{item_id}/
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
```

Required Postgres extensions: `pg_trgm`. Enable in the first migration.

## 2. API contract (`/api/v1`, bearer token)

All endpoints require `Authorization: Bearer <token>` except where noted.
Errors are JSON `{"detail": "..."}` with proper status codes. FastAPI's
generated OpenAPI docs at `/api/v1/docs` are the living contract.

```
POST   /api/v1/scan                  {code_value} → 200 {item} | 404 {code_value, known: false}
GET    /api/v1/items                 ?q=&category=&location=&tag=&page=  → paged list
POST   /api/v1/items                 create; may include code_value to bind a code atomically
GET    /api/v1/items/{id}
PATCH  /api/v1/items/{id}            partial update (incl. quantity set / delta)
DELETE /api/v1/items/{id}
POST   /api/v1/items/{id}/codes      {code_value, symbology} → attach code
DELETE /api/v1/codes/{code_value}    detach code
POST   /api/v1/items/{id}/photos     multipart upload → {photo}
DELETE /api/v1/photos/{photo_id}
GET    /api/v1/locations             tree
POST   /api/v1/locations
GET    /api/v1/categories
POST   /api/v1/categories
GET    /api/v1/export.csv            respects same filters as GET /items
POST   /api/v1/pair                  (unauthenticated) {pairing_token, device_name} → {bearer_token}
```

Quantity delta semantics on PATCH: accept either `{"quantity": 5}` (set) or
`{"quantity_delta": 1}` (adjust); reject both in one request.

## 3. Web UX flows

### Scan page (the core loop)
- One large auto-focused input. USB scanners keyboard-wedge into it.
- Mode toggle: **Lookup** (default) | **+1 on scan** (restock mode).
- On submit (HTMX POST to /scan):
  - Known code → swap in item card with inline edit; refocus + clear input.
  - Unknown code → swap in chooser: **[Create new item]** or
    **[Attach to existing item]** (search-as-you-type over item names,
    pg_trgm-backed).
- **Sticky defaults:** the create-item form pre-fills category and location
  from the last created item in this session. Design goal: 2 interactions
  per item when shelving a box of similar things, not 8.
- The whole flow is modal-free; every state is a server-rendered partial.

### Items list
- Filter bar: text search, category, location (tree select), tags.
- Thumbnail, name, quantity (with inline +/- steppers), location breadcrumb.
- CSV export button exports the current filter, not the whole table.

### Item detail
- Photos gallery (upload, reorder, delete), all fields inline-editable via
  HTMX, codes list with attach/detach, computed age shown next to
  acquired_date.

### Labels
- From an item: generate QR (payload = code_value; generate a new
  `inv:{uuid4}` value if the item has no code yet) via segno.
- Print sheet view: pick N items → Jinja2 template laid out with CSS grid
  matching Avery 5160 (address) and 22806 (square) templates. Print via
  browser. No PDF generation in v1.

### Auth screens
- First run (users table empty): setup page → create admin → redirect login.
- Login: username/password, session cookie (HttpOnly, SameSite=Lax).
- Settings → Users (admin only): list users, generate invite link
  (single-use, 7-day expiry), change roles, deactivate.
- Settings → Devices: list paired devices (name, last seen), revoke;
  "Pair new device" renders a QR containing a short-lived pairing token.

## 4. UX quality bar (why the incumbents lost)

These are acceptance criteria, not suggestions:
1. Scan loop requires zero mouse/touch between items (keyboard/scanner only).
2. Any list view renders usable in < 200 ms server-side on a Pi-class box
   with 10k items (paginate at 50, thumbnails pre-generated).
3. Every create/edit is reachable in ≤ 2 clicks from the relevant context.
4. Mobile-width responsive without a separate mobile layout — one CSS file,
   flexbox/grid, no framework.
5. Empty states teach: a fresh install's scan page explains the USB-scanner
   and manual-entry paths in one sentence each.
