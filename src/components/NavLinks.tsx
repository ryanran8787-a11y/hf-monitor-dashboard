"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// 導覽列：當前頁面底線標示，點擊區加大
const LINKS = [
  { href: "/", label: "總覽" },
  { href: "/compare", label: "雙雄 PK" },
  { href: "/watch", label: "追蹤" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <span className="flex items-center gap-0.5 sm:gap-1">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative px-2 py-2 text-[13px] transition-colors hover:text-zinc-900 sm:px-2.5 sm:text-[15px] dark:hover:text-white ${
              active ? "font-medium text-zinc-900 dark:text-white" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {l.label}
            {active && <span className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />}
          </Link>
        );
      })}
      <a
        href="https://huggingface.co/models"
        target="_blank"
        className="px-2 py-2 text-[13px] text-zinc-500 transition-colors hover:text-zinc-900 sm:px-2.5 sm:text-[15px] dark:text-zinc-400 dark:hover:text-white"
      >
        HF Hub ↗
      </a>
    </span>
  );
}
