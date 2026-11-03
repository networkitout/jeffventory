/** One fixed browser origin is essential: passkeys are bound to its hostname. */
export function authConfig() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.");
  }
  const url = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin (HTTP is allowed only on loopback).");
  }
  return { secret, origin: url.origin, rpID: url.hostname, secure: url.protocol === "https:" };
}
