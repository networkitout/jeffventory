import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const locations = await prisma.location.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(locations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const location = await prisma.location.upsert({ where: { name }, update: {}, create: { name } });
  return NextResponse.json(location, { status: 201 });
}
