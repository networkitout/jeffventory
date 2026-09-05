import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CONDITION_LABELS, formatMoney, type Condition, type Status } from "@/lib/constants";
import StatusBadge from "@/components/StatusBadge";
import DeleteItemButton from "@/components/DeleteItemButton";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: { category: true, location: true },
  });
  if (!item) notFound();

  const fields: Array<[string, React.ReactNode]> = [
    ["Quantity", item.quantity],
    ["Condition", CONDITION_LABELS[item.condition as Condition] ?? item.condition],
    ["Category", item.category?.name ?? "—"],
    ["Location", item.location?.name ?? "—"],
    ["Purchase price", formatMoney(item.purchasePrice)],
    ["List price", formatMoney(item.listPrice)],
    ["Added", item.createdAt.toLocaleDateString()],
    ["Updated", item.updatedAt.toLocaleDateString()],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          <p className="mt-1 flex items-center gap-3 text-sm text-zinc-400">
            <span className="font-mono">{item.sku}</span>
            <StatusBadge status={item.status as Status} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/labels?ids=${item.id}`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            🏷️ Label
          </Link>
          <Link href={`/items/${item.id}/edit`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Edit
          </Link>
          <DeleteItemButton id={item.id} name={item.name} />
        </div>
      </div>

      {item.description && <p className="max-w-2xl text-zinc-300">{item.description}</p>}

      <dl className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>

      {item.ebayUrl && (
        <p className="text-sm">
          <a href={item.ebayUrl} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">
            View eBay listing ↗
          </a>
        </p>
      )}

      {item.notes && (
        <div className="max-w-2xl rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
          <p className="mb-1 text-xs uppercase tracking-wide text-zinc-500">Notes</p>
          <p className="whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-8">
        <figure>
          <figcaption className="mb-2 text-xs uppercase tracking-wide text-zinc-500">SKU QR code</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/barcode?text=${encodeURIComponent(item.sku)}&type=qrcode&scale=4`}
            alt={`QR code for ${item.sku}`}
            className="rounded bg-white p-2"
            width={120}
            height={120}
          />
        </figure>
        {item.upc && (
          <figure>
            <figcaption className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Product barcode</figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/barcode?text=${encodeURIComponent(item.upc)}&type=auto&scale=2`}
              alt={`Barcode ${item.upc}`}
              className="rounded bg-white p-2"
              height={80}
            />
          </figure>
        )}
      </div>
    </div>
  );
}
