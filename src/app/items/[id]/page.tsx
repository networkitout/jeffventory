import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CONDITION_LABELS, formatMoney, isCondition } from "@/lib/constants";
import { isValidGtin } from "@/lib/codes";
import StatusBadge from "@/components/StatusBadge";
import DeleteItemButton from "@/components/DeleteItemButton";
import PhotoGallery from "@/components/PhotoGallery";
import StockControl from "@/components/StockControl";
import SellingHelper from "@/components/SellingHelper";
import Icon from "@/components/Icon";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const { id } = await params;
  const item = await prisma.item.findUnique({
    where: { id },
    include: {
      category: true, location: true,
      photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      activities: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 },
    },
  });
  if (!item) notFound();
  const fields = [
    ["Category", item.category?.name ?? "Uncategorized"],
    ["Location", item.location?.name ?? "No location yet"],
    ["Condition", isCondition(item.condition) ? CONDITION_LABELS[item.condition] : item.condition],
    ["Brand", item.brand ?? "Not recorded"],
    ...(item.modelNumber ? [["Model", item.modelNumber]] : []),
    ...(item.partNumber ? [["Part number", item.partNumber]] : []),
    ...(item.serialNumber ? [["Serial number", item.serialNumber]] : []),
    ["Purchase price / unit", formatMoney(item.purchasePrice)],
    ["Asking price / unit", formatMoney(item.listPrice)],
  ];
  const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div>
      <Link href="/" className="back-link"><Icon name="back" />Inventory</Link>
      <header className="page-header">
        <div className="min-w-0">
          <h1 className="break-words">{item.name}</h1>
          <div className="actions mt-3"><span className="mono muted">{item.sku}</span><StatusBadge status={item.status} /></div>
        </div>
        <div className="page-actions">
          <Link href={`/labels?ids=${id}`} className="button"><Icon name="print" />Print label</Link>
          <Link href={`/items/${id}/edit`} className="button button-primary"><Icon name="edit" />Edit item</Link>
        </div>
      </header>

      <div className="detail-layout">
        <div>
          <PhotoGallery itemId={id} itemName={item.name}
            initialPhotos={item.photos.map((photo) => ({ id: photo.id, originalName: photo.originalName, width: photo.width, height: photo.height }))} />
          <section className="detail-section">
            <h2>Find it with a code</h2>
            <div className="code-display">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/barcode?text=${encodeURIComponent(item.sku)}&type=qrcode&scale=4`} width="124" height="124" alt={`Inventory QR code for ${item.sku}`} />
                <figcaption>Your inventory label<br /><span className="mono">{item.sku}</span></figcaption>
              </figure>
              {item.upc && <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/barcode?text=${encodeURIComponent(item.upc)}&type=${isValidGtin(item.upc) ? "auto" : "qrcode"}&scale=3`}
                  width={isValidGtin(item.upc) ? 220 : 124} height="124" alt={`Product code ${item.upc}`} />
                <figcaption>Original product code<br /><span className="mono">{item.upc}</span></figcaption>
              </figure>}
            </div>
          </section>
          <section className="detail-section">
            <h2>Activity</h2>
            {item.activities.length ? <ol className="activity-list">
              {item.activities.map((activity) => <li key={activity.id}><Icon name="clock" width="15" height="15" />
                <div><p className="text-sm">{activity.message}</p><time dateTime={activity.createdAt.toISOString()}>{dateFormat.format(activity.createdAt)}</time></div>
              </li>)}
            </ol> : <p className="muted text-sm">Changes you make to this item will appear here.</p>}
          </section>
        </div>

        <div>
          {item.description && <p className="whitespace-pre-wrap mb-6">{item.description}</p>}
          <dl className="detail-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          {item.tags && <p className="item-tags mt-5"><Icon name="tag" className="inline mr-2" width="14" height="14" />{item.tags}</p>}
          {item.ebayUrl && <a href={item.ebayUrl} target="_blank" rel="noopener noreferrer" className="button button-small mt-5"><Icon name="external" />Open eBay listing</a>}
          <section className="detail-section">
            <h2>Stock &amp; status</h2>
            <StockControl id={id} initialQuantity={item.quantity} initialStatus={item.status} lowStockThreshold={item.lowStockThreshold} />
          </section>
          {item.notes && <section className="detail-section">
            <h2>Private notes</h2><p className="whitespace-pre-wrap muted text-sm">{item.notes}</p>
          </section>}
          <section className="detail-section" id="selling">
            <h2>Selling helper</h2>
            <SellingHelper item={{
              name: item.name, description: item.description, brand: item.brand, modelNumber: item.modelNumber,
              partNumber: item.partNumber, condition: item.condition, quantity: item.quantity,
              purchasePrice: item.purchasePrice, listPrice: item.listPrice, salePrice: item.salePrice,
              fees: item.fees, shippingCost: item.shippingCost,
            }} />
          </section>
          <section className="detail-section">
            <div className="actions">
              <Link href={`/items/new?copy=${id}`} className="button button-small"><Icon name="copy" />Add a similar item</Link>
              <DeleteItemButton id={id} name={item.name} />
            </div>
            <p className="field-hint mt-4">Added {dateFormat.format(item.createdAt)}. Archive an item to keep its photos and history without counting it as available stock.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
