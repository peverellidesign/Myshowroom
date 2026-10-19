"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  CalendarDays,
  CircleUserRound,
  FileText,
  House,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  Sofa,
  Sparkles,
  Users,
  Warehouse,
} from "lucide-react";
import { Brand } from "./brand";
import { Modal } from "./ui/modal";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

type NavItem = { href: string; label: string; icon: typeof House; show: boolean };

export function Shell({
  children,
  user,
  quoteCount,
  quoteHref,
  perms,
}: {
  children: ReactNode;
  user: { name: string; roleLabel: string };
  quoteCount: number;
  quoteHref: string;
  perms: { clients: boolean; quotes: boolean; admin: boolean; appointments: boolean };
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);

  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: House, show: true },
    { href: "/prodotti", label: "Prodotti", icon: Sofa, show: true },
    { href: "/stock", label: "Stock", icon: Warehouse, show: true },
    { href: "/clienti", label: "Clienti", icon: Users, show: perms.clients },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, show: perms.appointments },
    { href: "/preventivi", label: "Preventivi", icon: FileText, show: perms.quotes },
    { href: "/attivita", label: "Attività", icon: ListChecks, show: true },
    { href: "/ask", label: "Ask myshowroom", icon: Sparkles, show: true },
  ].filter((n) => n.show);
  const adminItem: NavItem = { href: "/admin", label: "Amministrazione", icon: Settings, show: perms.admin };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const primaryMobile = nav.filter((n) => ["/", "/prodotti", "/stock", "/clienti", "/agenda"].includes(n.href));
  const secondaryMobile = [...nav.filter((n) => !primaryMobile.includes(n)), ...(perms.admin ? [adminItem] : [])];

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-line bg-white lg:flex">
        <Link href="/" className="px-7 pb-8 pt-8">
          <Brand />
        </Link>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-4">
          {nav.map((n) => (
            <SideLink key={n.href} item={n} active={isActive(n.href)} />
          ))}
          {perms.admin && (
            <>
              <div className="mx-3 my-4 border-t border-line" />
              <SideLink item={adminItem} active={isActive("/admin")} />
            </>
          )}
        </nav>
        <div className="border-t border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <CircleUserRound size={30} strokeWidth={1.2} className="text-soft" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.roleLabel}</div>
            </div>
            <form action={logout}>
              <button className="rounded-full p-2 text-soft hover:bg-selected" title="Esci" aria-label="Esci">
                <LogOut size={17} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-10">
          <Link href="/" className="lg:hidden">
            <Brand />
          </Link>
          <p className="hidden text-sm text-muted lg:block">Your showroom. Everywhere.</p>
          <div className="flex items-center gap-1">
            {perms.quotes && (
              <Link href={quoteHref} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-ink hover:bg-selected" aria-label="Preventivo attivo">
                <ShoppingBag size={20} strokeWidth={1.5} />
                <span className="text-[15px]">{quoteCount}</span>
              </Link>
            )}
            {perms.appointments && (
              <Link href="/agenda" className="rounded-full p-2.5 text-ink hover:bg-selected" aria-label="Agenda">
                <CalendarDays size={20} strokeWidth={1.5} />
              </Link>
            )}
            <Link href="/ask" className="rounded-full p-2.5 text-ink hover:bg-selected" aria-label="Ask myshowroom">
              <Sparkles size={20} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-safe backdrop-blur-md lg:hidden" aria-label="Navigazione principale">
        <div className="mx-auto flex max-w-xl items-stretch justify-around px-1 pt-1.5">
          {primaryMobile.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10.5px]", isActive(n.href) ? "text-ink" : "text-muted")}
            >
              <n.icon size={21} strokeWidth={isActive(n.href) ? 1.8 : 1.4} />
              {n.label}
            </Link>
          ))}
          <button
            onClick={() => setMore(true)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10.5px]",
              secondaryMobile.some((n) => isActive(n.href)) ? "text-ink" : "text-muted",
            )}
          >
            <Menu size={21} strokeWidth={1.4} />
            Altro
          </button>
        </div>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="space-y-1">
          {secondaryMobile.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setMore(false)}
              className={cn("flex items-center gap-3 rounded-2xl px-4 py-3.5 text-[16px]", isActive(n.href) ? "bg-selected" : "hover:bg-selected")}
            >
              <n.icon size={20} strokeWidth={1.5} />
              {n.label}
            </Link>
          ))}
          <div className="my-3 border-t border-line" />
          <div className="flex items-center gap-3 px-4 py-2">
            <CircleUserRound size={28} strokeWidth={1.2} className="text-soft" />
            <div className="flex-1">
              <div className="text-sm">{user.name}</div>
              <div className="text-xs text-muted">{user.roleLabel}</div>
            </div>
            <form action={logout}>
              <button className="chip">
                <LogOut size={15} /> Esci
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] transition-colors",
        active ? "bg-[#555] text-white" : "text-ink hover:bg-selected",
      )}
    >
      <item.icon size={18} strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}
