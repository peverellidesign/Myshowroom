"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lets forms inside a modal close it after a successful submit. */
export const ModalCloseContext = createContext<(() => void) | null>(null);
export const useModalClose = () => useContext(ModalCloseContext);

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-fadein flex-col rounded-t-[24px] bg-canvas shadow-2xl sm:rounded-[24px]",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="text-lg text-ink">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-full p-2 text-soft hover:bg-selected" aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 pb-safe">
          <ModalCloseContext.Provider value={onClose}>{children}</ModalCloseContext.Provider>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Button + modal pair. `children` receives a close() callback. */
export function ModalTrigger({
  label,
  title,
  children,
  className,
  wide,
}: {
  label: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}

/** Server-component friendly trigger: children are plain nodes; ActionForms inside close the modal on success. */
export function ModalButton({
  label,
  title,
  children,
  className,
  wide,
  defaultOpen,
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {children}
      </Modal>
    </>
  );
}
