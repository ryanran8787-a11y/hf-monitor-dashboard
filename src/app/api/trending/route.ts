import { NextResponse } from "next/server";
import { fetchList } from "@/lib/hf";

export const revalidate = 600;

// GET /api/trending?kind=model&sort=likes&limit=50
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kinds = ["model", "dataset", "space"] as const;
  const sorts = ["likes", "downloads", "lastModified", "trendingScore"] as const;
  const kind = kinds.includes(searchParams.get("kind") as any)
    ? (searchParams.get("kind") as (typeof kinds)[number])
    : "model";
  const sort = sorts.includes(searchParams.get("sort") as any)
    ? (searchParams.get("sort") as (typeof sorts)[number])
    : "likes";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);
  try {
    const items = await fetchList(kind, { sort, limit });
    return NextResponse.json({ kind, sort, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
