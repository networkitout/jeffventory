import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ItemForm from "@/components/ItemForm";
import Icon from "@/components/Icon";

export const metadata = { title: "Edit item · Jeffventory" };

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  const { id } = await params;
  const [item, categories, locations] = await Promise.all([
    prisma.item.findUnique({ where: { id }, include: { category: true, location: true, _count: { select: { photos: true } } } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();

  return (
    <div>
      <Link href={`/items/${id}`} className="back-link"><Icon name="back" />Back to item</Link>
      <header className="page-header"><div><h1>Edit item</h1><p>{item.name}</p></div></header>
      <ItemForm mode="edit" photoCount={item._count.photos} initial={{
        id: item.id, sku: item.sku, name: item.name, description: item.description,
        quantity: item.quantity, upc: item.upc, condition: item.condition, status: item.status,
        purchasePrice: item.purchasePrice, listPrice: item.listPrice, salePrice: item.salePrice,
        fees: item.fees, shippingCost: item.shippingCost, ebayUrl: item.ebayUrl, notes: item.notes,
        brand: item.brand, modelNumber: item.modelNumber, partNumber: item.partNumber,
        serialNumber: item.serialNumber, tags: item.tags, lowStockThreshold: item.lowStockThreshold,
        categoryName: item.category?.name ?? "", locationName: item.location?.name ?? "",
      }} categoryNames={categories.map((category) => category.name)} locationNames={locations.map((location) => location.name)} />
    </div>
  );
}
