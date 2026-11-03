import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth-session";
import { ApiError, apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { createLocalUser } from "@/lib/user-management";
import { inventoryTransaction } from "@/lib/inventory-transactions";

export async function GET(request: Request) {
  try {
    await requireOwner(request.headers);
    return Response.json(await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, banned: true }, orderBy: { createdAt: "asc" },
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error, "list accounts"); }
}

export async function POST(request: Request) {
  try {
    await requireOwner(request.headers);
    return Response.json(await createLocalUser(await readJsonBody(request)), { status: 201 });
  } catch (error) { return apiErrorResponse(error, "create account", "An account with that email already exists."); }
}

export async function PATCH(request: Request) {
  try {
    await requireOwner(request.headers);
    const body = await readJsonBody(request);
    if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !("banned" in body) || typeof body.banned !== "boolean") {
      throw new ApiError(400, "Choose an account and access state.");
    }
    const { id, banned } = body;
    await inventoryTransaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new ApiError(404, "Account not found.");
      if (user.role === "admin") throw new ApiError(403, "Owner access cannot be disabled here.");
      await tx.user.update({ where: { id }, data: { banned, banReason: banned ? "Access disabled by owner" : null } });
      await tx.session.deleteMany({ where: { userId: id } });
    });
    return Response.json({ ok: true });
  } catch (error) { return apiErrorResponse(error, "change account access"); }
}
