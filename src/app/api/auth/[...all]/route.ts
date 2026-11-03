import { getAuth } from "@/lib/auth";
import { authConfig } from "@/lib/auth-config";
import { apiErrorResponse, ApiError, readBoundedBody, MAX_JSON_BYTES } from "@/lib/api-errors";
import { requireSession } from "@/lib/auth-session";

// Keep account provisioning local/owner-only. Do not expose unused plugin endpoints.
const GET_PATHS = new Set(["get-session", "list-sessions", "passkey/generate-register-options", "passkey/generate-authenticate-options", "passkey/list-user-passkeys"]);
const POST_PATHS = new Set(["sign-in/email", "sign-out", "change-password", "revoke-session", "revoke-other-sessions", "passkey/verify-registration", "passkey/verify-authentication", "passkey/delete-passkey", "passkey/update-passkey"]);
const SENSITIVE_PATHS = new Set(["passkey/generate-register-options", "passkey/verify-registration", "passkey/delete-passkey", "passkey/update-passkey"]);

async function handle(request: Request, context: { params: Promise<{ all: string[] }> }) {
  try {
    const path = (await context.params).all.join("/");
    if (!(request.method === "GET" ? GET_PATHS : POST_PATHS).has(path)) {
      throw new ApiError(404, "This authentication operation is not available.");
    }
    const { origin } = authConfig();
    // Fixed configured origin also works behind the private HTTPS reverse proxy.
    if ((request.headers.has("origin") && request.headers.get("origin") !== origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, `Open ${origin}/login to sign in. This browser address does not match the configured authentication origin.`);
    }
    if (SENSITIVE_PATHS.has(path)) {
      const session = await requireSession(request.headers);
      if (Date.now() - session.session.createdAt.getTime() > 10 * 60 * 1000) {
        throw new ApiError(403, "Sign out and sign in again before managing passkeys.");
      }
    }
    const headers = new Headers(request.headers);
    headers.set("x-jeffventory-auth-bucket", "127.0.0.1");
    const body = request.method === "POST" ? new Uint8Array(await readBoundedBody(request, MAX_JSON_BYTES)) : undefined;
    const response = await getAuth().handler(new Request(request.url, { method: request.method, headers, body }));
    response.headers.set("Cache-Control", "no-store");
    if (path === "passkey/generate-authenticate-options" && response.ok) {
      // The plugin defaults authentication options to "preferred". Ask the
      // authenticator for the same verification our server requires below.
      const options = await response.json();
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-length");
      return Response.json({ ...options, userVerification: "required" }, { headers: responseHeaders });
    }
    return response;
  } catch (error) {
    // Better Auth's client reads `message`; inventory clients read `error`.
    if (error instanceof ApiError) return Response.json({ message: error.message, error: error.message }, {
      status: error.status, headers: { "Cache-Control": "no-store" },
    });
    return apiErrorResponse(error, "authentication");
  }
}

export const GET = handle;
export const POST = handle;
