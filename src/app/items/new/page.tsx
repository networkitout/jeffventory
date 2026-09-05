import { prisma } from "@/lib/db";
import ItemForm from "@/components/ItemForm";

export const metadata = { title: "Add item · Jeffventory" };

export default async function NewItemPage({ searchParams }: PageProps<"/items/new">) {
  const sp = await searchParams;
  const upc = typeof sp.upc === "string" ? sp.upc : "";

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Add item</h1>
      {upc && (
        <p className="rounded-md border border-sky-800 bg-sky-950 px-3 py-2 text-sm text-sky-300">
          UPC <span className="font-mono">{upc}</span> pre-filled from scan.
        </p>
      )}
      <ItemForm
        mode="create"
        initial={{ upc }}
        categoryNames={categories.map((c) => c.name)}
        locationNames={locations.map((l) => l.name)}
      />
    </div>
  );
}
