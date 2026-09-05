import Link from "next/link";
import { prisma } from "@/lib/db";
import { STATUSES, STATUS_LABELS, formatMoney, type Status } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import type { Prisma } from "@/generated/prisma/client";

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const categoryId = typeof sp.categoryId === "string" ? sp.categoryId : "";
  const locationId = typeof sp.locationId === "string" ? sp.locationId : "";

  const where: Prisma.ItemWhereInput = {
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { sku: { contains: q } },
            { upc: { contains: q } },
            { notes: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, categories, locations] = await Promise.all([
    prisma.item.findMany({
      where,
      include: { category: true, location: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalValue = items.reduce((sum, i) => sum + (i.listPrice ?? 0) * i.quantity, 0);
  const labelIds = items.map((i) => i.id).join(",");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <span className="text-sm text-zinc-400">
          {items.length} item{items.length === 1 ? "" : "s"} · {totalQty} units · {formatMoney(totalValue)} listed value
        </span>
        {items.length > 0 && (
          <Link
            href={`/labels?ids=${labelIds}`}
            className="ml-auto rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
          >
            🏷️ Print labels ({items.length})
          </Link>
        )}
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, SKU, UPC, notes…"
          className="w-64 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 placeholder:text-zinc-500"
        />
        <select name="status" defaultValue={status} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select name="categoryId" defaultValue={categoryId} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
          <option value="">Any category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="locationId" defaultValue={locationId} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5">
          <option value="">Any location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-zinc-700 px-3 py-1.5 hover:bg-zinc-600">
          Filter
        </button>
        {(q || status || categoryId || locationId) && (
          <Link href="/" className="px-2 py-1.5 text-zinc-400 hover:text-zinc-100">
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          <p className="mb-3">No items found.</p>
          <Link href="/items/new" className="text-emerald-400 hover:underline">
            Add your first item
          </Link>{" "}
          or{" "}
          <Link href="/scan" className="text-emerald-400 hover:underline">
            scan a barcode
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 text-right font-medium">List price</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-zinc-800 hover:bg-zinc-900/60">
                  <td className="px-3 py-2">
                    <Link href={`/items/${item.id}`} className="font-medium text-zinc-100 hover:text-emerald-400">
                      {item.name}
                    </Link>
                    {item.upc && <span className="ml-2 font-mono text-xs text-zinc-500">UPC {item.upc}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{item.sku}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={item.status as Status} />
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{item.category?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{item.location?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(item.listPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
