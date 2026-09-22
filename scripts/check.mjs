import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const c = await db.snapshot.count();
const h = await db.metricHistory.count();
const top = await db.snapshot.findMany({
  where: { kind: "model", sortBy: "likes" },
  orderBy: { rank: "asc" },
  take: 5,
  select: { rank: true, hfId: true, likes: true, downloads: true },
});
console.log(JSON.stringify({ snapshots: c, history: h, top }, null, 2));
await db.$disconnect();
