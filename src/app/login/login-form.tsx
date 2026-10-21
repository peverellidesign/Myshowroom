"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login } from "./actions";
import { buttonClass } from "@/components/ui/button";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <input name="email" type="email" autoComplete="username" required placeholder="Email" className="field" />
      <input name="password" type="password" autoComplete="current-password" required placeholder="Password" className="field" />
      {state?.error && <p className="px-2 text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        Accedi
      </button>
    </form>
  );
}
