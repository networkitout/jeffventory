import Link from "next/link";
import { prisma } from "@/lib/db";
import { buildItemWhere, buildItemOrderBy } from "@/lib/inventory-query";
import { formatMoney } from "@/lib/constants";
import Icon from "@/components/Icon";
import InventoryWorkbench from "@/components/InventoryWorkbench";

const PAGE_SIZE = 48;

export default async function Home({ searchParams }: PageProps<"/">) {
  const raw = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") search.set(key, value);
  }
  const where = buildItemWhere(search);
  const [count, categories, locations, overview, lowStockCount] = await Promise.all([
    prisma.item.count({ where }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { status: true, quantity: true, listPrice: true } }),
    prisma.item.count({ where: buildItemWhere(new URLSearchParams("lowStock=1")) }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const pageInput = Number(search.get("page") || 1);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(pageInput) ? pageInput : 1));
  const items = await prisma.item.findMany({
    where,
    orderBy: [buildItemOrderBy(search), { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      category: true,
      location: true,
      photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1 },
      _count: { select: { photos: true } },
    },
  });
  const available = overview.filter((item) => item.status === "IN_STOCK" || item.status === "LISTED");
  const activeValue = available.reduce((sum, item) => sum + Math.round((item.listPrice ?? 0) * 100) * item.quantity, 0) / 100;
  const units = available.reduce((sum, item) => sum + item.quantity, 0);
  const q = search.get("q") ?? "";
  const status = search.get("status") ?? "";
  const lowStock = search.get("lowStock") === "1";
  const filtered = Boolean(q || status || lowStock || search.get("categoryId") || search.get("locationId"));

  function href(changes: Record<string, string>) {
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  const tabs = [
    { name: "All items", status: "", lowStock: "" },
    { name: "In stock", status: "IN_STOCK", lowStock: "" },
    { name: "Listed", status: "LISTED", lowStock: "" },
    { name: "Sold", status: "SOLD", lowStock: "" },
    { name: `Low stock${lowStockCount ? ` (${lowStockCount})` : ""}`, status: "", lowStock: "1" },
    { name: "Archived", status: "ARCHIVED", lowStock: "" },
  ];

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Your inventory</h1>
          <p>Know what you have, where it lives, and what it&apos;s worth.</p>
        </div>
        <div className="page-actions">
          <Link href="/scan" className="button"><Icon name="scan" />Scan a code</Link>
          <Link href="/items/new" className="button button-primary"><Icon name="plus" />Add item</Link>
        </div>
      </header>

      <dl className="inventory-summary" aria-label="Whole inventory overview">
        <div><dt>item records</dt><dd>{overview.length.toLocaleString("en-US")}</dd></div>
        <div><dt>available units</dt><dd>{units.toLocaleString("en-US")}</dd></div>
        <div><dt>asking value</dt><dd>{formatMoney(activeValue)}</dd></div>
        <div><dt>listed items</dt><dd>{overview.filter((item) => item.status === "LISTED").length}</dd></div>
      </dl>

      <nav className="inventory-tabs" aria-label="Inventory views">
        {tabs.map((tab) => (
          <Link key={tab.name} href={href({ status: tab.status, lowStock: tab.lowStock, page: "" })}
            aria-current={status === tab.status && lowStock === (tab.lowStock === "1") ? "page" : undefined}>
            {tab.name}
          </Link>
        ))}
      </nav>

      <form method="GET" className="filter-form" key={search.toString()} aria-label="Filter inventory">
        {status && <input type="hidden" name="status" value={status} />}
        {lowStock && <input type="hidden" name="lowStock" value="1" />}
        <div className="search-field">
          <Icon name="search" />
          <label htmlFor="inventory-search" className="sr-only">Search inventory</label>
          <input type="search" className="input" id="inventory-search" name="q" defaultValue={q}
            placeholder="Search names, codes, parts, or tags" />
          <kbd aria-hidden="true">/</kbd>
        </div>
        <label className="sr-only" htmlFor="category-filter">Category</label>
        <select id="category-filter" name="categoryId" className="input" defaultValue={search.get("categoryId") ?? ""}>
          <option value="">All categories</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="location-filter">Location</label>
        <select id="location-filter" name="locationId" className="input" defaultValue={search.get("locationId") ?? ""}>
          <option value="">All locations</option>
          {locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="sort-order">Sort order</label>
        <select id="sort-order" name="sort" className="input" defaultValue={search.get("sort") ?? "updated"}>
          <option value="updated">Recently updated</option>
          <option value="name">Name A to Z</option>
          <option value="quantity">Quantity: low first</option>
          <option value="value">Price: high first</option>
        </select>
        <button type="submit" className="button">Filter</button>
        {filtered && <Link href="/" className="button button-quiet">Clear</Link>}
      </form>

      {items.length ? (
        <>
          <InventoryWorkbench
            key={`${search.toString()}-${page}`}
            items={items.map((item) => ({
              id: item.id, name: item.name, sku: item.sku, quantity: item.quantity,
              status: item.status, listPrice: item.listPrice, lowStockThreshold: item.lowStockThreshold,
              categoryName: item.category?.name ?? null, locationName: item.location?.name ?? null,
              brand: item.brand, partNumber: item.partNumber, tags: item.tags,
              photoId: item.photos[0]?.id ?? null, photoCount: item._count.photos,
            }))}
            locationNames={locations.map((location) => location.name)}
            exportQuery={search.toString()}
            total={count}
          />
          <div className="pagination">
            <span>Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, count)} of {count} {filtered ? "matching " : ""}items</span>
            {pages > 1 && <nav className="actions" aria-label="Inventory pagination">
              {page > 1 && <Link className="button button-small" href={href({ page: String(page - 1) })}>Previous</Link>}
              <span>Page {page} of {pages}</span>
              {page < pages && <Link className="button button-small" href={href({ page: String(page + 1) })}>Next</Link>}
            </nav>}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <Icon name={filtered ? "search" : "box"} width="44" height="44" />
          <h2>{filtered ? "No items match this view" : "Give your first item a home"}</h2>
          <p>{filtered ? "Try a different name, code, or filter. Your other inventory is still here." : "Start with the thing on your desk. Add a photo, give it a location, and make it findable."}</p>
          <div className="actions">
            {filtered ? <Link href="/" className="button">Clear filters</Link> :
              <><Link href="/items/new" className="button button-primary"><Icon name="plus" />Add your first item</Link>
                <Link href="/scan" className="button"><Icon name="scan" />Scan a barcode</Link></>}
          </div>
        </div>
      )}
    </div>
  );
}
