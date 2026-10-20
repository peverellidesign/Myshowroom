import { cn } from "@/lib/utils";

/** Calm placeholders shown instantly while a page loads. */
export function Bone({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[14px] bg-[#ECEAE5]", className)} />;
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Bone className="aspect-[4/5] rounded-[20px]" />
          <Bone className="mt-3 h-3 w-1/3" />
          <Bone className="mt-2 h-4 w-2/3" />
          <Bone className="mt-2 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ grid = true }: { grid?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Caricamento">
      <Bone className="h-3 w-32" />
      <Bone className="mt-3 h-10 w-64 max-w-full" />
      <Bone className="mt-3 h-4 w-80 max-w-full" />
      <Bone className="mt-7 h-12 w-full rounded-full" />
      <div className="mt-6">{grid ? <CardGridSkeleton /> : <ListSkeleton />}</div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-[20px] bg-white p-3">
          <Bone className="h-14 w-14 shrink-0 rounded-[14px]" />
          <div className="flex-1">
            <Bone className="h-4 w-1/2" />
            <Bone className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
