import Link from "next/link";
import { prisma } from "@/lib/db";
import ItemForm, { type ItemFormValues } from "@/components/ItemForm";
import Icon from "@/components/Icon";
import { notFound } from "next/navigation";

export const metadata = { title: "Add item · Jeffventory" };

export default async function NewItemPage({ searchParams }: PageProps<"/items/new">) {
  const sp = await searchParams;
  const upc = typeof sp.upc === "string" ? sp.upc : "";
  const copyId = typeof sp.copy === "string" ? sp.copy : "";
  const [categories, locations, original] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
    copyId ? prisma.item.findUnique({ where: { id: copyId }, include: { category: true, location: true } }) : null,
  ]);
  if (copyId && !original) notFound();
  const initial: ItemFormValues = original ? {
    name: original.name, description: original.description, upc: original.upc,
    quantity: 1, status: "IN_STOCK", condition: original.condition,
    brand: original.brand, modelNumber: original.modelNumber, partNumber: original.partNumber,
    tags: original.tags, categoryName: original.category?.name, locationName: original.location?.name,
    purchasePrice: original.purchasePrice, listPrice: original.listPrice,
    lowStockThreshold: original.lowStockThreshold,
  } : { upc };

  return (
    <div>
      <Link href="/" className="back-link"><Icon name="back" />Inventory</Link>
      <header className="page-header"><div><h1>{original ? "Add a similar item" : "Add an item"}</h1><p>A few details now. A lot less searching later.</p></div></header>
      {upc && !original && <p className="notice">Scanned code <span className="mono">{upc}</span> is ready below.</p>}
      {original && <p className="notice">Product details copied. This item will get a new SKU; add its own serial number and photos.</p>}
      <ItemForm mode="create" initial={initial} categoryNames={categories.map((category) => category.name)} locationNames={locations.map((location) => location.name)} />
    </div>
  );
}
