"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarDays,
  CircleUserRound,
  FileText,
  House,
  LayoutGrid,
  ListChecks,
  LogOut,
  Search,
  Settings,
  ShoppingBag,
  Sofa,
  Sparkles,
  Users,
  Warehouse,
} from "lucide-react";
import { Brand } from "./brand";
import { Modal } from "./ui/modal";
import { InstallButton, InstallPrompt } from "./install-prompt";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

type NavItem = { href: string; label: string; short?: string; icon: typeof House; show: boolean };

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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setMore(false), [pathname]);

  const nav: NavItem[] = [
    { href: "/", label: "Home", icon: House, show: true },
    { href: "/prodotti", label: "Prodotti", icon: Sofa, show: true },
    { href: "/stock", label: "Showroom & Stock", short: "Stock", icon: Warehouse, show: true },
    { href: "/clienti", label: "Clienti", icon: Users, show: perms.clients },
    { href: "/agenda", label: "Agenda", icon: CalendarDays, show: perms.appointments },
    { href: "/preventivi", label: "Preventivi", icon: FileText, show: perms.quotes },
    { href: "/attivita", label: "Attività", icon: ListChecks, show: true },
    { href: "/documenti", label: "Cataloghi", icon: BookOpen, show: true },
    { href: "/ask", label: "Ask myshowroom", short: "Ask", icon: Sparkles, show: true },
  ].filter((n) => n.show);
  const adminItem: NavItem = { href: "/admin", label: "Amministrazione", icon: Settings, show: perms.admin };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const primaryMobile = nav.filter((n) => ["/", "/prodotti", "/stock", "/clienti", "/agenda"].includes(n.href));
  const secondaryMobile = [...nav.filter((n) => !primaryMobile.includes(n)), ...(perms.admin ? [adminItem] : [])];
  const home = pathname === "/";

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
        <div className="px-4 pb-3">
          <InstallButton className="w-full" />
        </div>
        <div className="border-t border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} />
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

      {/* Top bar: transparent over the hero on Home (mobile/tablet), frosted elsewhere */}
      <header
        className={cn(
          "pt-safe sticky top-0 z-30 transition-colors duration-300",
          home && !scrolled ? "border-b border-transparent bg-transparent lg:border-line lg:bg-white/90" : "border-b border-line bg-[#FAFAF8]/85 backdrop-blur-xl",
          home && "max-lg:-mb-[60px]",
        )}
      >
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6 lg:h-16 lg:px-10">
          <Link href="/" className={cn("lg:hidden", home && !scrolled && "[&_*]:!text-white")}>
            <Brand />
          </Link>
          <p className="hidden text-sm text-muted lg:block">Your showroom. Everywhere.</p>
          <div className={cn("flex items-center gap-0.5", home && !scrolled && "max-lg:text-white")}>
            <Link href="/prodotti" className="pressable rounded-full p-2.5 hover:bg-black/5 lg:hidden" aria-label="Cerca">
              <Search size={21} strokeWidth={1.6} />
            </Link>
            {perms.quotes && (
              <Link href={quoteHref} className="pressable relative rounded-full p-2.5 hover:bg-black/5" aria-label={`Preventivo attivo, ${quoteCount} articoli`}>
                <ShoppingBag size={21} strokeWidth={1.6} />
                {quoteCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-charcoal px-1 text-[10.5px] font-medium text-white ring-2 ring-white">
                    {quoteCount}
                  </span>
                )}
              </Link>
            )}
            <Link href="/ask" className="pressable rounded-full p-2.5 hover:bg-black/5" aria-label="Ask myshowroom">
              <Sparkles size={21} strokeWidth={1.6} />
            </Link>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-[1280px] px-4 pb-36 sm:px-6 lg:px-10 lg:pb-16", home ? "pt-0 lg:pt-10" : "pt-5 sm:pt-7 lg:pt-10")}>{children}</main>

      {/* Mobile & tablet tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/[0.06] bg-white/85 pb-safe backdrop-blur-xl lg:hidden" aria-label="Navigazione principale">
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-1 pt-1.5">
          {primaryMobile.map((n) => {
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} className="pressable flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1" aria-current={active ? "page" : undefined}>
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active ? "bg-charcoal text-white" : "text-[#6f6f6a]")}>
                  <n.icon size={20} strokeWidth={active ? 1.9 : 1.5} />
                </span>
                <span className={cn("text-[10.5px] tracking-[0.01em]", active ? "font-medium text-ink" : "text-muted")}>{n.short ?? n.label}</span>
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className="pressable flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1" aria-label="Altre sezioni">
            <span
              className={cn(
                "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                secondaryMobile.some((n) => isActive(n.href)) ? "bg-charcoal text-white" : "text-[#6f6f6a]",
              )}
            >
              <LayoutGrid size={20} strokeWidth={1.5} />
            </span>
            <span className="text-[10.5px] text-muted">Altro</span>
          </button>
        </div>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-2xl bg-white p-4">
            <Avatar name={user.name} large />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px]">{user.name}</div>
              <div className="text-sm text-muted">{user.roleLabel}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {secondaryMobile.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn("pressable flex aspect-square flex-col items-center justify-center gap-2.5 rounded-2xl bg-white p-2 text-center text-[13px]", isActive(n.href) && "ring-1 ring-ink")}
              >
                <n.icon size={24} strokeWidth={1.4} />
                {n.short ?? n.label}
              </Link>
            ))}
          </div>
          <InstallButton className="w-full" />
          <form action={logout}>
            <button className="pressable flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white py-3 text-[15px]">
              <LogOut size={16} /> Esci
            </button>
          </form>
          <p className="text-center text-[11px] uppercase tracking-[0.2em] text-muted">myshowroom · Peverelli Design</p>
        </div>
      </Modal>

      <InstallPrompt />
    </div>
  );
}

function Avatar({ name, large }: { name: string; large?: boolean }) {
  const initials = name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#EDEBE6] font-medium text-[#555]", large ? "h-12 w-12 text-base" : "h-9 w-9 text-xs")}>
      {initials || <CircleUserRound size={18} />}
    </span>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-full px-4 py-2.5 text-[15px] transition-colors",
        active ? "bg-charcoal text-white" : "text-ink hover:bg-selected",
      )}
    >
      <item.icon size={18} strokeWidth={1.5} />
      {item.label}
    </Link>
  );
}
