export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return;
  return typeof error.code === "string" ? error.code : undefined;
}

// Prisma errors can contain submitted inventory values. Do not log their messages,
// arguments, or request bodies; these diagnostics deliberately contain no item data.
export function logUnexpectedError(context: string, error: unknown) {
  const code = errorCode(error);
  console.error(`[${context}] Operation failed`, {
    name: error instanceof Error ? error.name : "UnknownError",
    ...(code && /^[A-Z0-9_]{1,40}$/.test(code) ? { code } : {}),
  });
}

export function apiErrorResponse(
  error: unknown,
  context: string,
  duplicateMessage = "A record with this value already exists.",
): Response {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const code = errorCode(error);
  if (code === "P2002") {
    return Response.json({ error: duplicateMessage }, { status: 409 });
  }
  if (code === "P2025") {
    return Response.json({ error: "Item or photo not found." }, { status: 404 });
  }
  if (code === "P2034" || code === "SQLITE_BUSY") {
    return Response.json(
      { error: "Inventory is being changed by another request. Please retry." },
      { status: 409 },
    );
  }
  logUnexpectedError(context, error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

export function assertMutationRequest(
  request: Request,
  contentType?: "application/json" | "multipart/form-data",
) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // NextURL rewrites 127.0.0.1 and ::1 to localhost. Use the actual Host
  // header so the browser's origin is compared against the address it opened.
  const host = request.headers.get("host");
  const requestOrigin = process.env.BETTER_AUTH_URL
    ? new URL(process.env.BETTER_AUTH_URL).origin
    : host ? new URL(`${url.protocol}//${host}`).origin : url.origin;
  // With HTTPS termination, use the configured browser origin, not backend HTTP.
  // Authenticated command-line clients may omit Origin.
  if (origin !== null && origin !== requestOrigin) {
    throw new ApiError(403, "Cross-origin changes are not allowed.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Cross-origin changes are not allowed.");
  }
  if (
    contentType &&
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== contentType
  ) {
    throw new ApiError(415, `Content-Type must be ${contentType}.`);
  }
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw new ApiError(400, "Invalid Content-Length.");
    if (Number(length) > maxBytes) throw new ApiError(413, "Request body is too large.");
  }
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch (error) {
          logUnexpectedError("request body cancellation", error);
        }
        throw new ApiError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export const MAX_JSON_BYTES = 64 * 1024;

export async function readJsonBody(request: Request): Promise<unknown> {
  assertMutationRequest(request, "application/json");
  const bytes = await readBoundedBody(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new ApiError(400, "Request body must contain valid JSON.");
  }
}
