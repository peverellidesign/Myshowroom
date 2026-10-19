"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; text: string; error?: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md animate-fadein items-center gap-3 rounded-full px-5 py-3 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
              t.error ? "bg-[#8E2F2F] text-white" : "bg-charcoal text-white",
            )}
          >
            {t.error ? <X size={16} /> : <Check size={16} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
