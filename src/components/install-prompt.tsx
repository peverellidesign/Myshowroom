"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Modal } from "./ui/modal";
import { cn } from "@/lib/utils";

/**
 * "Installa l'app": uses the browser install prompt where available (Chrome, Edge,
 * Android) and shows the Add-to-Home-Screen steps on iPhone and iPad (Safari).
 */

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function useInstallState() {
  const canPrompt = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => !!deferred,
    () => false,
  );
  const [env, setEnv] = useState({ standalone: true, ios: false });
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setEnv({ standalone, ios });
  }, []);
  return { canPrompt, ...env };
}

async function runPrompt() {
  if (!deferred) return false;
  await deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  emit();
  return true;
}

function IosSteps() {
  return (
    <div className="space-y-5">
      <p className="text-[15px] text-soft">Aggiungi myshowroom alla schermata Home: si aprirà a tutto schermo, come un&apos;app.</p>
      <ol className="space-y-3">
        <li className="flex items-center gap-4 rounded-2xl bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-selected">
            <Share size={19} strokeWidth={1.6} />
          </span>
          <span className="text-[15px]">
            In Safari tocca <strong className="font-medium">Condividi</strong> nella barra in basso (su iPad in alto a destra).
          </span>
        </li>
        <li className="flex items-center gap-4 rounded-2xl bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-selected">
            <SquarePlus size={19} strokeWidth={1.6} />
          </span>
          <span className="text-[15px]">
            Scegli <strong className="font-medium">Aggiungi alla schermata Home</strong>, poi <strong className="font-medium">Aggiungi</strong>.
          </span>
        </li>
      </ol>
      <p className="text-xs text-muted">Su Android e computer usa il pulsante «Installa» del browser (Chrome, Edge) oppure il menu ⋮ → Installa app.</p>
    </div>
  );
}

/** Button for menus: hidden when the app already runs installed. */
export function InstallButton({ className }: { className?: string }) {
  const { canPrompt, standalone } = useInstallState();
  const [open, setOpen] = useState(false);
  if (standalone) return null;
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (!(canPrompt && (await runPrompt()))) setOpen(true);
        }}
        className={cn("pressable flex items-center justify-center gap-2 rounded-full bg-charcoal px-4 py-3 text-[14px] text-white", className)}
      >
        <Download size={16} /> Installa l&apos;app
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Installa myshowroom">
        <IosSteps />
      </Modal>
    </>
  );
}

const DISMISS_KEY = "myshowroom.install.dismissed";

/** One-time suggestion card on phones and tablets. */
export function InstallPrompt() {
  const { canPrompt, standalone, ios } = useInstallState();
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    if (standalone || !(ios || canPrompt)) return;
    let dismissed = 0;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    } catch {}
    if (Date.now() - dismissed < 14 * 86400_000) return;
    const t = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(t);
  }, [standalone, ios, canPrompt]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  if (!visible) return null;
  return (
    <>
      <div className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-fadein lg:bottom-6 lg:left-auto lg:right-6">
        <div className="flex items-center gap-3 rounded-[22px] bg-charcoal p-3 pl-4 text-white shadow-2xl">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">Installa myshowroom</p>
            <p className="text-[12.5px] text-white/70">Aprila dalla schermata Home, a tutto schermo.</p>
          </div>
          <button
            onClick={async () => {
              if (canPrompt && (await runPrompt())) return setVisible(false);
              setSteps(true);
            }}
            className="pressable rounded-full bg-white px-4 py-2 text-[13px] font-medium text-ink"
          >
            Installa
          </button>
          <button onClick={dismiss} className="rounded-full p-1.5 text-white/60" aria-label="Non ora">
            <X size={16} />
          </button>
        </div>
      </div>
      <Modal
        open={steps}
        onClose={() => {
          setSteps(false);
          dismiss();
        }}
        title="Installa myshowroom"
      >
        <IosSteps />
      </Modal>
    </>
  );
}
