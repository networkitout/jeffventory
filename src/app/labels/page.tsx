import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/constants";
import PrintButton from "@/components/PrintButton";

export const metadata = { title: "Print labels · Jeffventory" };

export default async function LabelsPage({ searchParams }: PageProps<"/labels">) {
  const sp = await searchParams;
  const idsParam = typeof sp.ids === "string" ? sp.ids : "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const items = ids.length
    ? await prisma.item.findMany({
        where: { id: { in: ids } },
        include: { location: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-semibold">Labels</h1>
        <span className="text-sm text-zinc-400">
          {items.length} label{items.length === 1 ? "" : "s"} — QR encodes the item SKU
        </span>
        {items.length > 0 && (
          <div className="ml-auto">
            <PrintButton />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 p-10 text-center text-zinc-400">
          No items selected. Pick items from the <Link href="/" className="text-emerald-400 hover:underline">inventory</Link> first.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3 print:gap-[0.08in]">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded border border-zinc-400 bg-white p-2 text-black print:break-inside-avoid print:rounded-none"
              style={{ width: "2.6in", height: "1.3in" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/barcode?text=${encodeURIComponent(item.sku)}&type=qrcode&scale=3`}
                alt={`QR ${item.sku}`}
                className="h-[1.05in] w-[1.05in] shrink-0"
              />
              <div className="min-w-0 leading-tight">
                <p className="line-clamp-2 text-[11px] font-semibold">{item.name}</p>
                <p className="mt-0.5 font-mono text-[10px]">{item.sku}</p>
                {item.location && <p className="text-[9px] text-zinc-600">{item.location.name}</p>}
                {item.listPrice != null && <p className="text-[10px] font-semibold">{formatMoney(item.listPrice)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
