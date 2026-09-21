import { isValidGtin } from "./codes";

const LOOKUP_ENDPOINT = "https://api.upcitemdb.com/prod/trial/lookup";
const LOOKUP_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

const errorMessages = {
  400: "Enter a valid UPC/EAN/GTIN barcode (8, 12, 13, or 14 digits with a valid check digit).",
  429: "UPCitemdb's free lookup limit has been reached. Please wait before trying again; the daily quota may need to reset.",
  502: "UPCitemdb lookup is unavailable right now. Please try again later.",
  504: "UPCitemdb did not respond in time. Please try again.",
} as const;

export class ProductLookupError extends Error {
  constructor(public readonly status: keyof typeof errorMessages) {
    super(errorMessages[status]);
    this.name = "ProductLookupError";
  }
}

export interface ProductSuggestion {
  name: string;
  description: string | null;
  brand: string | null;
  modelNumber: string | null;
  categoryName: string | null;
}

export type ProductLookupResult = {
  source: "UPCitemdb";
  sourceUrl: string;
} & (
  | { found: true; product: ProductSuggestion }
  | { found: false }
);

interface LookupOptions {
  fetcher?: typeof fetch;
  /** Overridden only by tests; the route always uses the six-second deadline. */
  timeoutMs?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ProductLookupError(502);
  return value.trim().slice(0, maxLength).trim() || null;
}

function productSuggestion(value: unknown): ProductSuggestion {
  if (!isObject(value)) throw new ProductLookupError(502);
  const name = optionalText(value.title, 200);
  if (!name) throw new ProductLookupError(502);

  const category = optionalText(value.category, 2_000);
  // UPCitemdb supplies a taxonomy path; suggest its leaf, not a long folder path.
  const categoryLeaf = category?.split(">").filter((part) => part.trim()).pop();
  return {
    name,
    description: optionalText(value.description, 2_000),
    brand: optionalText(value.brand, 200),
    modelNumber: optionalText(value.model, 200),
    categoryName: optionalText(categoryLeaf, 100),
  };
}

async function readProviderJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (
    mediaType !== "application/json" ||
    Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES ||
    response.body === null
  ) {
    throw new ProductLookupError(502);
  }

  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    void reader.cancel().catch(() => { console.warn("Product lookup response cleanup failed."); });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new ProductLookupError(504);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new ProductLookupError(502);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const data: unknown = JSON.parse(text);
    return data;
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

async function requestProduct(
  code: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<ProductLookupResult> {
  const url = new URL(LOOKUP_ENDPOINT);
  url.searchParams.set("upc", code);
  const response = await fetcher(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-store",
    signal,
  });
  if (response.status === 429) throw new ProductLookupError(429);
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    throw new ProductLookupError(502);
  }

  const data = await readProviderJson(response, signal);
  if (!isObject(data) || typeof data.code !== "string") {
    throw new ProductLookupError(502);
  }
  if (["EXCEED_LIMIT", "TOO_FAST", "HTTP_TOO_MANY_REQUESTS"].includes(data.code)) {
    throw new ProductLookupError(429);
  }
  if (response.status === 400 && data.code === "INVALID_UPC") {
    throw new ProductLookupError(400);
  }

  const attribution = {
    source: "UPCitemdb" as const,
    // Construct this ourselves: never return provider-supplied images or links.
    sourceUrl: `https://www.upcitemdb.com/upc/${code}`,
  };
  if ((response.ok || response.status === 404) && data.code === "NOT_FOUND") {
    if (
      (data.items !== undefined && (!Array.isArray(data.items) || data.items.length !== 0)) ||
      (data.total !== undefined && data.total !== 0)
    ) {
      throw new ProductLookupError(502);
    }
    return { found: false, ...attribution };
  }
  if (!response.ok || data.code !== "OK" || !Array.isArray(data.items)) {
    throw new ProductLookupError(502);
  }
  if (
    data.total !== undefined &&
    (typeof data.total !== "number" ||
      !Number.isSafeInteger(data.total) ||
      data.total !== data.items.length)
  ) {
    throw new ProductLookupError(502);
  }
  if (data.items.length === 0) return { found: false, ...attribution };

  const firstItem: unknown = data.items[0];
  return { found: true, product: productSuggestion(firstItem), ...attribution };
}

/**
 * Called only after an explicit lookup request. Sends one validated barcode,
 * never inventory fields, credentials, or photos; does not persist suggestions.
 */
export async function lookupProduct(
  rawCode: string,
  { fetcher = globalThis.fetch, timeoutMs = LOOKUP_TIMEOUT_MS }: LookupOptions = {},
): Promise<ProductLookupResult> {
  // Bound input before trimming, and keep all significant leading zeroes.
  if (rawCode.length > 64) throw new ProductLookupError(400);
  const code = rawCode.trim();
  if (!isValidGtin(code)) throw new ProductLookupError(400);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProductLookupError(504));
    }, timeoutMs);
  });

  try {
    // The deadline covers fetching AND streaming the body, even if a fetcher
    // fails to honor AbortSignal. Native fetch is also aborted to free resources.
    return await Promise.race([requestProduct(code, fetcher, controller.signal), deadline]);
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
    ) {
      throw new ProductLookupError(504);
    }
    if (error instanceof ProductLookupError) throw error;
    throw new ProductLookupError(502);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
