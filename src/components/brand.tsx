import { cn } from "@/lib/utils";

export function Brand({ className, large }: { className?: string; large?: boolean }) {
  return (
    <div className={cn("leading-none", className)}>
      <div className={cn("font-medium tracking-[-0.01em] text-ink", large ? "text-[40px] sm:text-[52px]" : "text-[22px]")}>myshowroom</div>
      <div className={cn("mt-1.5 uppercase tracking-brand text-muted", large ? "text-[12px] sm:text-[13px]" : "text-[10px]")}>
        by Peverelli Design
      </div>
    </div>
  );
}
