import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Accedi" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="relative grid min-h-dvh bg-[#2a2826] lg:grid-cols-[1.15fr_1fr] lg:bg-canvas">
      {/* Photo: full screen on phones and tablets, left half on desktop */}
      <div className="absolute inset-0 lg:relative">
        <img src="/api/public/hero" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/75 lg:from-black/10 lg:to-black/30" />
        <div className="pt-safe absolute inset-x-0 top-0 px-6 py-6 lg:hidden">
          <div className="leading-none text-white">
            <div className="text-[22px] font-medium tracking-[-0.01em]">myshowroom</div>
            <div className="mt-1.5 text-[10px] uppercase tracking-brand text-white/70">by Peverelli Design</div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col justify-end lg:justify-center">
        <div className="pb-safe rounded-t-[32px] bg-canvas px-6 pb-8 pt-8 shadow-[0_-20px_60px_rgba(0,0,0,0.25)] sm:mx-auto sm:mb-10 sm:w-full sm:max-w-md sm:rounded-[32px] sm:px-10 sm:pb-10 lg:mb-0 lg:max-w-sm lg:bg-transparent lg:px-0 lg:shadow-none">
          <div className="hidden leading-none lg:block">
            <div className="text-[44px] font-medium tracking-[-0.02em] text-ink">myshowroom</div>
            <div className="mt-2 text-[12px] uppercase tracking-brand text-muted">by Peverelli Design</div>
          </div>
          <h1 className="text-[28px] font-light tracking-[-0.02em] lg:mt-8 lg:text-[18px] lg:font-normal lg:tracking-normal lg:text-soft">
            <span className="lg:hidden">Your showroom. Everywhere.</span>
            <span className="hidden lg:inline">Your showroom. Everywhere.</span>
          </h1>
          <p className="mt-1 text-[15px] text-soft lg:hidden">Accedi per entrare nel tuo showroom.</p>
          <div className="mt-6 lg:mt-10">
            <LoginForm next={next} />
          </div>
          <p className="mt-8 text-center text-[10.5px] uppercase tracking-[0.18em] text-muted lg:text-left">Peverelli Design · Como · Lugano · Milano · Dubai</p>
        </div>
      </div>
    </main>
  );
}
