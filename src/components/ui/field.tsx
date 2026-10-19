import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, children, hint, className }: { label?: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block px-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn("field", props.className)} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn("field", props.className)}>
      {children}
    </select>
  );
}
