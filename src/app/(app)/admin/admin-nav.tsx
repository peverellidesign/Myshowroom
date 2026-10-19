"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={cn("chip", (i.href === "/admin" ? path === "/admin" : path.startsWith(i.href)) && "chip-active")}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
