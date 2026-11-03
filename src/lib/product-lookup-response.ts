import { lookupProduct, ProductLookupError } from "@/lib/product-lookup";

const headers = { "Cache-Control": "no-store" };

export async function productLookupResponse(request: Request) {
  try {
    const code = new URL(request.url).searchParams.get("code") ?? "";
    const result = await lookupProduct(code);
    return Response.json(result, { headers });
  } catch (error) {
    if (!(error instanceof ProductLookupError)) {
      // Do not log barcodes, provider payloads, or potentially sensitive errors.
      console.error("Unexpected product lookup failure.");
    }
    const failure = error instanceof ProductLookupError ? error : new ProductLookupError(502);
    return Response.json({ error: failure.message }, { status: failure.status, headers });
  }
}
