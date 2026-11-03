import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "./db";
import { ApiError } from "./api-errors";
import { inventoryTransaction } from "./inventory-transactions";

export function parseNewUser(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Enter an email, name, and password.");
  const values = input as Record<string, unknown>;
  const email = typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const password = typeof values.password === "string" ? values.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ApiError(400, "Enter a valid email address.");
  if (!name || name.length > 100) throw new ApiError(400, "Name must be between 1 and 100 characters.");
  validatePassword(password);
  return { email, name, password };
}

export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new ApiError(400, "Use a password between 12 and 128 characters.");
}

export async function createLocalUser(input: unknown, owner = false) {
  const { email, name, password } = parseNewUser(input);
  const hash = await hashPassword(password);
  return inventoryTransaction(async (tx) => {
    if (owner && await tx.user.count({ where: { role: "admin" } })) throw new ApiError(409, "An owner already exists. Use the recovery command if you are locked out.");
    const id = randomUUID();
    return tx.user.create({
      data: {
        id, email, name, role: owner ? "admin" : "user",
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: hash } },
      },
      select: { id: true, email: true, name: true, role: true, banned: true },
    });
  });
}

// Local-console recovery invalidates every session and passkey for this account.
export async function recoverLocalUser(email: string, password: string) {
  validatePassword(password);
  const hash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) throw new ApiError(404, "Account not found.");
    await tx.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      create: { id: randomUUID(), accountId: user.id, userId: user.id, providerId: "credential", password: hash },
      update: { password: hash },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passkey.deleteMany({ where: { userId: user.id } });
    await tx.user.update({ where: { id: user.id }, data: { banned: false, banReason: null, banExpires: null } });
  });
}
