import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ItemForm from "@/components/ItemForm";

export const metadata = { title: "Edit item · Jeffventory" };

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  const { id } = await params;
  const [item, categories, locations] = await Promise.all([
    prisma.item.findUnique({ where: { id }, include: { category: true, location: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!item) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit: {item.name}</h1>
      <ItemForm
        mode="edit"
        initial={{
          id: item.id,
          sku: item.sku,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          upc: item.upc,
          condition: item.condition,
          status: item.status,
          purchasePrice: item.purchasePrice,
          listPrice: item.listPrice,
          ebayUrl: item.ebayUrl,
          notes: item.notes,
          categoryName: item.category?.name ?? "",
          locationName: item.location?.name ?? "",
        }}
        categoryNames={categories.map((c) => c.name)}
        locationNames={locations.map((l) => l.name)}
      />
    </div>
  );
}
