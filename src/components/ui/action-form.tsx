"use client";

import { useRef, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/action";
import { useToast } from "./toast";
import { useModalClose } from "./modal";
import { Button, buttonClass } from "./button";
import { cn } from "@/lib/utils";

type Props<T> = {
  action: (form: FormData) => Promise<ActionResult<T>>;
  children: ReactNode;
  className?: string;
  onSuccess?: (data: T | undefined) => void;
  resetOnSuccess?: boolean;
  redirectTo?: (data: T | undefined) => string | null;
  successMessage?: string;
  keepOpen?: boolean;
  /** Serializable redirect for server components, e.g. "/preventivi/{id}" filled from the action data. */
  redirectPattern?: string;
};

/** Generic form bound to a server action: pending state, toast feedback, optional reset/redirect. */
export function ActionForm<T>({ action, children, className, onSuccess, resetOnSuccess, redirectTo, successMessage, keepOpen, redirectPattern }: Props<T>) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const closeModal = useModalClose();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await action(fd);
      if (!res.ok) {
        toast(res.error, true);
        return;
      }
      const msg = res.message ?? successMessage;
      if (msg) toast(msg);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(res.data);
      if (!keepOpen) closeModal?.();
      let to = redirectTo?.(res.data) ?? null;
      if (!to && redirectPattern && res.data) {
        const d = res.data as Record<string, unknown>;
        to = redirectPattern.replace(/\{(\w+)\}/g, (_, k) => String(d[k] ?? ""));
      }
      if (to) router.push(to);
      else router.refresh();
    });
  }

  return (
    <form ref={ref} onSubmit={submit} aria-busy={pending} className="min-w-0">
      <fieldset disabled={pending} className={cn("m-0 min-w-0 border-0 p-0", className)}>
        {children}
      </fieldset>
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  size = "md",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button type="submit" className={cn(buttonClass(variant, size, className), "group")}>
      <Loader2 size={16} className="hidden animate-spin group-disabled:block" />
      {children}
    </button>
  );
}

/** One-click action button (e.g. delete, toggle) with optional confirmation. */
export function ActionButton<T>({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  successMessage,
  redirectTo,
  title,
}: {
  action: () => Promise<ActionResult<T>>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg" | "icon";
  className?: string;
  successMessage?: string;
  redirectTo?: string;
  title?: string;
}) {
  // redirectTo may contain {key} placeholders filled from the action data (e.g. "/preventivi/{id}").
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      title={title}
      aria-label={title}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const res = await action();
          if (!res.ok) return toast(res.error, true);
          if (res.message ?? successMessage) toast((res.message ?? successMessage)!);
          if (redirectTo) {
            const d = (res.data ?? {}) as Record<string, unknown>;
            router.push(redirectTo.replace(/\{(\w+)\}/g, (_, k) => String(d[k] ?? "")));
          } else router.refresh();
        });
      }}
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : children}
    </Button>
  );
}
