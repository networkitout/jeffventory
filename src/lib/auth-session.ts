import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { ApiError } from "./api-errors";

export async function currentSession(inputHeaders?: Headers) {
  const requestHeaders = inputHeaders ?? await headers();
  return getAuth().api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
}

export async function requireSession(inputHeaders?: Headers) {
  const session = await currentSession(inputHeaders);
  if (!session || session.user.banned) throw new ApiError(401, "Sign in to access this inventory.");
  return session;
}

export async function requirePageSession() {
  const session = await currentSession();
  if (!session || session.user.banned) redirect("/login");
  return session;
}

export async function requireOwner(inputHeaders?: Headers) {
  const session = await requireSession(inputHeaders);
  if (session.user.role !== "admin") throw new ApiError(403, "Only the owner can manage access.");
  return session;
}
