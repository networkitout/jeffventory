import { withInventoryAuth } from "@/lib/auth-route";
import { productLookupResponse } from "@/lib/product-lookup-response";

export const GET = withInventoryAuth(productLookupResponse);
