import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[#E9E6E0] lg:block">
        <img src="/api/public/hero" alt="" className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="flex flex-col justify-between px-6 py-10 sm:px-12">
        <div />
        <div className="mx-auto w-full max-w-sm">
          <Brand large />
          <p className="mt-6 text-[17px] text-soft">Your showroom. Everywhere.</p>
          <div className="mt-10">
            <LoginForm next={next} />
          </div>
        </div>
        <p className="mx-auto mt-10 w-full max-w-sm text-xs uppercase tracking-[0.12em] text-muted">Peverelli Design · Como · Lugano · Milano · Dubai</p>
      </div>
    </main>
  );
}
