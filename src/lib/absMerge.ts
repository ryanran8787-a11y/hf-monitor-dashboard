// 絕對值曲線共用：多榜單同分鐘去重（詳情頁＋PK 頁共用，别再各寫一份）。
// 規則：likes 榜優先；缺 likes 的時間點用其他榜補上；同分鐘多筆留最新（輸入按時間升序）。
export interface AbsHistRow {
  createdAt: Date;
  likes: number;
  downloads: number;
  sortBy: string;
}

export interface AbsMerged {
  likes: number;
  downloads: number;
  time: number;
  sortBy: string;
}

export function fmtT(d: Date) {
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function mergeAbsByMinute(hist: AbsHistRow[]): Map<string, AbsMerged> {
  const m = new Map<string, AbsMerged>();
  for (const h of hist) {
    const at = new Date(h.createdAt);
    const k = fmtT(at);
    const cur = m.get(k);
    if (!cur || (cur.sortBy !== "likes" && h.sortBy === "likes")) {
      m.set(k, { likes: h.likes, downloads: h.downloads, time: at.getTime(), sortBy: h.sortBy });
    }
  }
  return m;
}
