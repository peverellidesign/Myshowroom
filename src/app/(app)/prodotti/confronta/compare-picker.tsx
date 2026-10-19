"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { COMPARE_KEY, readCompare } from "@/components/product-actions";

/** Syncs the compare list between localStorage and the URL. */
export function CompareSync() {
  const sp = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const ids = sp.get("ids");
    if (!ids) {
      const stored = readCompare();
      if (stored.length) router.replace(`/prodotti/confronta?ids=${stored.join(",")}`);
    } else {
      try {
        localStorage.setItem(COMPARE_KEY, JSON.stringify(ids.split(",").filter(Boolean)));
      } catch {}
    }
  }, [sp, router]);
  return null;
}

export function RemoveFromCompare({ id, ids }: { id: string; ids: string[] }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        const next = ids.filter((x) => x !== id);
        try {
          localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
        } catch {}
        router.replace(next.length ? `/prodotti/confronta?ids=${next.join(",")}` : "/prodotti/confronta?vuoto=1");
      }}
      className="text-xs text-soft link-quiet"
    >
      Rimuovi
    </button>
  );
}
