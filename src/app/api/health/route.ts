import { prisma } from "@/lib/db";
import { logUnexpectedError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.item.findFirst({ select: { id: true } });
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logUnexpectedError("health check", error);
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
