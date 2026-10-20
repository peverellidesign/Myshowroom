import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="h-display">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[16px] text-soft sm:text-[17px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("mb-8", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="eyebrow">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("card p-5 sm:p-6", className)}>{children}</div>;
}

const badgeTones = {
  neutral: "bg-selected text-ink",
  dark: "bg-[#555] text-white",
  outline: "border border-line text-soft",
  success: "bg-[#EEF2EC] text-[#3F5A3A]",
  warning: "bg-[#F5EFE4] text-[#7A5B24]",
  danger: "bg-[#F6ECEC] text-[#8E2F2F]",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof badgeTones; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px]", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="outline" className={cn("uppercase tracking-wider text-[10px]", className)}>
      Demo
    </Badge>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <p className="text-lg text-ink">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-soft">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, icon, href }: { label: string; value: ReactNode; icon?: ReactNode; href?: string }) {
  const inner = (
    <div className="card h-full p-5 transition hover:border-ink/20">
      <div className="mb-6 text-soft">{icon}</div>
      <div className="text-[40px] font-light leading-none tracking-tight text-[#555]">{value}</div>
      <div className="mt-2 text-sm text-soft">{label}</div>
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-3 text-[15px]">
          <dt className="shrink-0 text-soft">{k}</dt>
          <dd className="min-w-0 text-right text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
