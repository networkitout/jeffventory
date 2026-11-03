import { requirePageSession } from "@/lib/auth-session";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/constants";
import { isValidGtin } from "@/lib/codes";
import PrintButton from "@/components/PrintButton";
import Icon from "@/components/Icon";

export const metadata = { title: "Print labels · Jeffventory" };
const templates = {
  standard: { name: "Shelf label (2.6 x 1.3 in)", width: "2.6in", height: "1.3in" },
  compact: { name: "Small bin (2 x 1 in)", width: "2in", height: "1in" },
  large: { name: "Large item (4 x 2 in)", width: "4in", height: "2in" },
};

export default async function LabelsPage({ searchParams }: PageProps<"/labels">) {
  await requirePageSession();
  const sp = await searchParams;
  const idsParam = typeof sp.ids === "string" ? sp.ids : "";
  const ids = [...new Set(idsParam.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 200);
  const template = sp.template === "compact" || sp.template === "large" ? sp.template : "standard";
  const symbology = sp.type === "barcode" ? "barcode" : "qrcode";
  const source = sp.source === "product" ? "product" : "sku";
  const copiesInput = Number(typeof sp.copies === "string" ? sp.copies : 1);
  const copies = Number.isInteger(copiesInput) ? Math.max(1, Math.min(20, copiesInput)) : 1;
  const showPrice = sp.price === "1";
  const items = ids.length ? await prisma.item.findMany({
    where: { id: { in: ids } }, include: { location: true }, orderBy: { name: "asc" },
  }) : [];
  const tooMany = items.length * copies > 200;
  const missingCodes = source === "product" ? items.filter((item) => !item.upc) : [];
  const printable = source === "product" ? items.filter((item) => Boolean(item.upc)) : items;
  const layout = templates[template];

  return (
    <div>
      <header className="page-header print:hidden">
        <div><h1>Labels that find their way home</h1><p>Use your inventory SKU, or reuse the product&apos;s existing code.</p></div>
        {printable.length > 0 && !tooMany && <PrintButton />}
      </header>
      {!items.length ? <div className="empty-state">
        <Icon name="print" width="44" height="44" /><h2>Choose what you want to label</h2>
        <p>Select items in your inventory, then choose Print selected. You can also print a label from any item&apos;s page.</p>
        <Link href="/" className="button button-primary">Choose items</Link>
      </div> : <>
        <form className="label-controls print:hidden" method="GET" aria-label="Label options">
          <input type="hidden" name="ids" value={ids.join(",")} />
          <div><label className="field-label" htmlFor="label-template">Label size</label>
            <select id="label-template" className="input" name="template" defaultValue={template}>{Object.entries(templates).map(([value, option]) => <option key={value} value={value}>{option.name}</option>)}</select></div>
          <div><label className="field-label" htmlFor="label-source">Encode</label>
            <select id="label-source" className="input" name="source" defaultValue={source}><option value="sku">Inventory SKU</option><option value="product">Original product code</option></select></div>
          <div><label className="field-label" htmlFor="label-type">Code style</label>
            <select id="label-type" className="input" name="type" defaultValue={symbology}><option value="qrcode">QR code</option><option value="barcode">Barcode</option></select></div>
          <div className="copies-input"><label className="field-label" htmlFor="label-copies">Copies / item</label>
            <input id="label-copies" type="number" className="input" min={1} max={20} step={1} name="copies" defaultValue={copies} /></div>
          <label className="checkbox-label"><input type="checkbox" name="price" value="1" defaultChecked={showPrice} />Show price</label>
          <button className="button">Update preview</button>
        </form>
        <p className="muted text-xs mb-5 print:hidden">{printable.length * copies} labels &middot; Print at 100% / actual size with browser headers and footers off. Test on plain paper before loading label stock.</p>
        {missingCodes.length > 0 && <p className="notice notice-warning print:hidden" role="status">{missingCodes.length} {missingCodes.length === 1 ? "item has" : "items have"} no product code and won&apos;t be printed. Choose Inventory SKU to label every item.</p>}
        {ids.length !== items.length && <p className="notice notice-warning print:hidden">Some selected items no longer exist. Only existing items are shown.</p>}
        {tooMany ? <p className="notice notice-error" role="alert">Print up to 200 labels at a time. Reduce the copies or select fewer items.</p> :
          <div className="label-grid">
            {printable.flatMap((item) => Array.from({ length: copies }, (_, index) => {
              const code = source === "product" ? item.upc! : item.sku;
              const canUseLinear = /^[\x20-\x7e]{1,32}$/.test(code);
              const linear = symbology === "barcode" && canUseLinear;
              const type = linear ? (isValidGtin(code) ? "auto" : "code128") : "qrcode";
              return <div className={`inventory-label label-${template}${linear ? " label-linear" : ""}`} key={`${item.id}-${index}`} style={{ width: layout.width, height: layout.height }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/barcode?text=${encodeURIComponent(code)}&type=${type}&scale=4`} alt={`${linear ? "Barcode" : "QR code"} for ${code}`} />
                <div className="label-copy">
                  <p className="label-name">{item.name}</p>
                  <p className="label-sku mono">{item.sku}</p>
                  {item.location && <p className="label-meta">{item.location.name}</p>}
                  {showPrice && item.listPrice !== null && <p className="label-price">{formatMoney(item.listPrice)} / unit</p>}
                </div>
              </div>;
            }))}
          </div>}
        {symbology === "barcode" && printable.some((item) => !/^[\x20-\x7e]{1,32}$/.test(source === "product" ? item.upc! : item.sku)) &&
          <p className="field-hint print:hidden">Long codes and codes with non-ASCII characters use QR to keep labels readable and preserve the exact text.</p>}
      </>}
    </div>
  );
}
