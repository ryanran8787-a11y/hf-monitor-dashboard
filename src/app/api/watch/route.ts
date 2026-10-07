import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// 追蹤清單 API（單人專案無登入，全站一份）。上限 50 台，保護 HF 配額。
const KINDS = ["model", "dataset", "space"];
const HFID = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/;
const MAX_WATCH = 50;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const kind = body?.kind;
  const hfId = body?.hfId;
  if (!KINDS.includes(kind) || typeof hfId !== "string" || !HFID.test(hfId)) {
    return NextResponse.json({ error: "kind must be model/dataset/space, hfId like org/name" }, { status: 400 });
  }
  try {
    const count = await db.watch.count();
    if (count >= MAX_WATCH) {
      return NextResponse.json({ error: `Watchlist full (${MAX_WATCH} max). Unwatch something first.` }, { status: 429 });
    }
    await db.watch.create({ data: { kind, hfId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ ok: true, existed: true });
    return NextResponse.json({ error: "DB write failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "";
  const hfId = u.searchParams.get("hfId") ?? "";
  if (!KINDS.includes(kind) || !HFID.test(hfId)) {
    return NextResponse.json({ error: "Bad parameters" }, { status: 400 });
  }
  try {
    await db.watch.delete({ where: { kind_hfId: { kind, hfId } } });
  } catch {
    // 本來就沒有，當成功
  }
  return NextResponse.json({ ok: true });
}
