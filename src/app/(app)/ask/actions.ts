"use server";

import { assertUser } from "@/lib/auth";
import { askMyshowroom, type AskResult, type AskTurn } from "@/lib/ai";
import { errorMessage } from "@/lib/action";

export async function ask(question: string, history: AskTurn[]): Promise<{ ok: true; result: AskResult } | { ok: false; error: string }> {
  try {
    const user = await assertUser("ai:use");
    const q = question.trim().slice(0, 1000);
    if (!q) return { ok: false, error: "Scrivi una domanda." };
    return { ok: true, result: await askMyshowroom(q, history.slice(-10), user) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
