import assert from "node:assert/strict";
import test from "node:test";
import { productLookupResponse as GET } from "../src/lib/product-lookup-response";
import {
  lookupProduct,
  ProductLookupError,
  type ProductLookupResult,
} from "../src/lib/product-lookup";

const code = "012345678905";
const attribution = {
  source: "UPCitemdb" as const,
  sourceUrl: `https://www.upcitemdb.com/upc/${code}`,
};
const providerItem = {
  title: "  Example bench supply  ",
  description: "  Adjustable output.  ",
  brand: "  Example  ",
  model: "  PS-12  ",
  category: "Electronics > Power > Power Supplies",
  images: ["https://images.example.test/do-not-import.jpg"],
  offers: [{ link: "https://store.example.test/do-not-follow" }],
  sourceUrl: "https://untrusted.example.test/do-not-use",
};
const providerHit = { code: "OK", total: 1, offset: 0, items: [providerItem] };
const providerMiss = { code: "OK", total: 0, offset: 0, items: [] };
const expectedHit: ProductLookupResult = {
  found: true,
  product: {
    name: "Example bench supply",
    description: "Adjustable output.",
    brand: "Example",
    modelNumber: "PS-12",
    categoryName: "Power Supplies",
  },
  ...attribution,
};

function jsonFetcher(data: unknown, status = 200): typeof fetch {
  return async () => Response.json(data, { status });
}

function lookupError(status: 400 | 429 | 502 | 504) {
  return (error: unknown) => {
    assert.ok(error instanceof ProductLookupError);
    assert.equal(error.status, status);
    assert.equal(error.message, new ProductLookupError(status).message);
    assert.doesNotMatch(error.message, /provider-private-detail/);
    return true;
  };
}

test("lookup sends only the barcode to the fixed trial endpoint and returns public text", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls += 1;
    assert.equal(String(input), `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.referrerPolicy, "no-referrer");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json(providerHit);
  };

  assert.deepEqual(await lookupProduct(code, { fetcher }), expectedHit);
  assert.equal(calls, 1, "do not fetch photos, follow links, or automatically retry");
});

test("all supported GTIN lengths preserve leading zeros and packaging digits", async () => {
  for (const barcode of ["96385074", code, "0012345678905", "00012345678905", "10012345678902"]) {
    const fetcher: typeof fetch = async (input) => {
      assert.equal(new URL(String(input)).searchParams.get("upc"), barcode);
      return Response.json(providerMiss);
    };
    const result = await lookupProduct(barcode, { fetcher });
    assert.equal(result.sourceUrl, `https://www.upcitemdb.com/upc/${barcode}`);
    assert.equal(result.found, false);
  }
  assert.deepEqual(await lookupProduct(` ${code} `, { fetcher: jsonFetcher(providerHit) }), expectedHit);
});

test("invalid codes fail before any provider request", async () => {
  const fetcher: typeof fetch = async () => {
    assert.fail("invalid input must not make a network call");
  };
  for (const invalid of [
    "", "JV-SAMPLE", "1234567", "123456789", "12345678901", "123456789012345",
    "012345678906", "01234x678905", "０１２３４５６７８９０５",
    "https://example.test/012345678905", `${code},${code}`, "0".repeat(65),
  ]) {
    await assert.rejects(lookupProduct(invalid, { fetcher }), lookupError(400));
  }
});

test("missing or empty optional fields become null, not invented product data", async () => {
  const result = await lookupProduct(code, {
    fetcher: jsonFetcher({
      code: "OK",
      items: [{ title: "Sample", description: null, brand: " ", model: "", category: null }],
    }),
  });
  assert.deepEqual(result, {
    found: true,
    product: { name: "Sample", description: null, brand: null, modelNumber: null, categoryName: null },
    ...attribution,
  });
});

test("suggestion strings stay within form and item validation limits", async () => {
  const result = await lookupProduct(code, {
    fetcher: jsonFetcher({
      code: "OK",
      items: [{
        title: "n".repeat(500),
        description: "d".repeat(4_000),
        brand: "b".repeat(500),
        model: "m".repeat(500),
        category: `Parent > ${"c".repeat(300)}`,
      }],
    }),
  });
  assert.ok(result.found);
  assert.equal(result.product.name.length, 200);
  assert.equal(result.product.description?.length, 2_000);
  assert.equal(result.product.brand?.length, 200);
  assert.equal(result.product.modelNumber?.length, 200);
  assert.equal(result.product.categoryName?.length, 100);
});

test("an empty success or documented NOT_FOUND is a normal miss", async () => {
  for (const [data, status] of [
    [providerMiss, 200],
    [{ code: "NOT_FOUND", message: "No matched item was found." }, 404],
    [{ code: "NOT_FOUND", total: 0, items: [] }, 200],
  ] as const) {
    assert.deepEqual(
      await lookupProduct(code, { fetcher: jsonFetcher(data, status) }),
      { found: false, ...attribution },
    );
  }
});

test("HTTP and provider quota failures are 429 and never a fabricated miss", async () => {
  await assert.rejects(
    lookupProduct(code, { fetcher: async () => new Response("provider-private-detail", { status: 429 }) }),
    lookupError(429),
  );
  for (const errorCode of ["EXCEED_LIMIT", "TOO_FAST", "HTTP_TOO_MANY_REQUESTS"]) {
    await assert.rejects(
      lookupProduct(code, { fetcher: jsonFetcher({ code: errorCode, message: "provider-private-detail" }) }),
      lookupError(429),
    );
  }
});

test("a provider rejection of a locally valid code remains an invalid-input error", async () => {
  await assert.rejects(
    lookupProduct(code, { fetcher: jsonFetcher({ code: "INVALID_UPC" }, 400) }),
    lookupError(400),
  );
});

test("malformed schemas and contradictory no-hit data are upstream errors", async () => {
  for (const data of [
    null, [], "OK", {}, { code: "OK" }, { code: "OK", items: null },
    { code: "OK", items: {} }, { code: "OK", items: [null] },
    { code: "OK", items: [{}] }, { code: "OK", items: [{ title: 42 }] },
    { code: "OK", items: [{ title: " " }] },
    { ...providerHit, total: "1" }, { ...providerMiss, total: 1 },
    { ...providerHit, total: -1 }, { ...providerHit, code: "SERVER_ERR" },
    { code: "NOT_FOUND", items: [providerItem] },
    { code: "NOT_FOUND", total: 1 },
    ...["description", "brand", "model", "category"].map((field) => ({
      code: "OK", items: [{ ...providerItem, [field]: { unexpected: true } }],
    })),
  ]) {
    await assert.rejects(lookupProduct(code, { fetcher: jsonFetcher(data) }), lookupError(502));
  }
});

test("network, HTTP, JSON, media type, and encoding failures are safe 502 errors", async () => {
  const failures: Array<() => Response> = [
    () => new Response("provider-private-detail", { status: 503 }),
    () => new Response(null, { status: 302, headers: { Location: "https://example.test/" } }),
    () => Response.json({ code: "NOT_FOUND" }, { status: 500 }),
    () => Response.json({ code: "OK", items: [] }, { status: 404 }),
    () => Response.json({ code: "INVALID_QUERY" }, { status: 400 }),
    () => new Response("<html>provider-private-detail</html>", { status: 404 }),
    () => new Response("{malformed", { headers: { "Content-Type": "application/json" } }),
    () => new Response(JSON.stringify(providerMiss), { headers: { "Content-Type": "text/html" } }),
    () => new Response(null, { status: 204 }),
    () => new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } }),
  ];
  for (const failure of failures) {
    await assert.rejects(lookupProduct(code, { fetcher: async () => failure() }), lookupError(502));
  }
  await assert.rejects(
    lookupProduct(code, { fetcher: async () => { throw new TypeError("provider-private-detail"); } }),
    lookupError(502),
  );
});

test("response size is bounded by declared length and actual streamed bytes", async () => {
  await assert.rejects(lookupProduct(code, {
    fetcher: async () => new Response(JSON.stringify(providerMiss), {
      headers: { "Content-Type": "application/json", "Content-Length": String(256 * 1024 + 1) },
    }),
  }), lookupError(502));

  for (const contentLength of [undefined, "1"]) {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 3; index += 1) controller.enqueue(new Uint8Array(100 * 1024).fill(32));
      },
      cancel() { cancelled = true; },
    });
    const headers = new Headers({ "Content-Type": "application/json" });
    if (contentLength) headers.set("Content-Length", contentLength);
    await assert.rejects(
      lookupProduct(code, { fetcher: async () => new Response(body, { headers }) }),
      lookupError(502),
    );
    assert.equal(cancelled, true);
  }
});

test("UTF-8 characters split across stream chunks are decoded correctly", async () => {
  const payload = new TextEncoder().encode(JSON.stringify({ code: "OK", items: [{ title: "Café 🔧" }] }));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of payload) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const result = await lookupProduct(code, {
    fetcher: async () => new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } }),
  });
  assert.ok(result.found);
  assert.equal(result.product.name, "Café 🔧");
});

test("the deadline aborts a stalled fetch even if the fetcher ignores its signal", async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher: typeof fetch = (_input, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => undefined);
  };
  await assert.rejects(lookupProduct(code, { fetcher, timeoutMs: 15 }), lookupError(504));
  assert.equal(signal?.aborted, true);
});

test("the deadline also cancels a stalled response body", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(lookupProduct(code, {
    timeoutMs: 15,
    fetcher: async () => new Response(body, { headers: { "Content-Type": "application/json" } }),
  }), lookupError(504));
  assert.equal(cancelled, true);
});

test("fetch timeout and abort exceptions are 504, not missing products", async () => {
  for (const name of ["TimeoutError", "AbortError"]) {
    await assert.rejects(lookupProduct(code, {
      fetcher: async () => { throw new DOMException("provider-private-detail", name); },
    }), lookupError(504));
  }
});

test("errors are not cached and a later explicit lookup can succeed", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return calls === 1 ? new Response(null, { status: 429 }) : Response.json(providerHit);
  };
  await assert.rejects(lookupProduct(code, { fetcher }), lookupError(429));
  assert.deepEqual(await lookupProduct(code, { fetcher }), expectedHit);
  assert.equal(calls, 2);
});

test("product lookup response exposes the specified JSON contract and no-store on every outcome", async (t) => {
  const scenarios: Array<{
    name: string;
    query: string;
    fetcher: typeof fetch;
    status: number;
    expected: ProductLookupResult | { error: string };
    calls: number;
  }> = [
    { name: "hit", query: `code=${code}&notes=not-for-provider`, fetcher: jsonFetcher(providerHit), status: 200, expected: expectedHit, calls: 1 },
    { name: "miss", query: `code=${code}`, fetcher: jsonFetcher(providerMiss), status: 200, expected: { found: false, source: "UPCitemdb", sourceUrl: attribution.sourceUrl }, calls: 1 },
    { name: "missing code", query: "", fetcher: jsonFetcher(providerHit), status: 400, expected: { error: new ProductLookupError(400).message }, calls: 0 },
    { name: "invalid checksum", query: "code=012345678906", fetcher: jsonFetcher(providerHit), status: 400, expected: { error: new ProductLookupError(400).message }, calls: 0 },
    { name: "quota", query: `code=${code}`, fetcher: jsonFetcher({}, 429), status: 429, expected: { error: new ProductLookupError(429).message }, calls: 1 },
    { name: "malformed", query: `code=${code}`, fetcher: jsonFetcher({ code: "OK" }), status: 502, expected: { error: new ProductLookupError(502).message }, calls: 1 },
    { name: "timeout", query: `code=${code}`, fetcher: async () => { throw new DOMException("provider-private-detail", "TimeoutError"); }, status: 504, expected: { error: new ProductLookupError(504).message }, calls: 1 },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, async (t) => {
      const fetcher: typeof fetch = async (input, init) => {
        assert.equal(String(input), `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
        assert.deepEqual(init?.headers, { Accept: "application/json" });
        return scenario.fetcher(input, init);
      };
      const mockedFetch = t.mock.method(globalThis, "fetch", fetcher);
      const response = await GET(new Request(
        `http://127.0.0.1:3000/api/products/lookup?${scenario.query}`,
        { headers: { Cookie: "local-preference=dark", "X-Inventory-Note": "not-for-provider" } },
      ));
      assert.equal(response.status, scenario.status);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
      assert.deepEqual(await response.json(), scenario.expected);
      assert.equal(mockedFetch.mock.callCount(), scenario.calls);
    });
  }
});
