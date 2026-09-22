import { NextResponse } from "next/server";
import { fetchList } from "@/lib/hf";

export const revalidate = 600;

// GET /api/trending?kind=model&sort=likes&limit=50
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") ?? "model") as any;
  const sort = (searchParams.get("sort") ?? "likes") as any;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  try {
    const items = await fetchList(kind, { sort, limit });
    return NextResponse.json({ kind, sort, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
