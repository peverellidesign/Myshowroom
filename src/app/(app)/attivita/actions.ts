"use server";

import { revalidatePath } from "next/cache";
import type { TaskPriority } from "@prisma/client";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { run } from "@/lib/action";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { optStr, str } from "@/lib/utils";

function refresh(clientId?: string | null) {
  revalidatePath("/attivita");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clienti/${clientId}`);
}

function parse(form: FormData) {
  const title = str(form, "title");
  if (!title) throw new AppError("Inserisci il titolo dell'attività.");
  const due = str(form, "dueDate");
  const priority = (str(form, "priority") || "MEDIA") as TaskPriority;
  if (!["BASSA", "MEDIA", "ALTA"].includes(priority)) throw new AppError("Priorità non valida.");
  return {
    title,
    description: optStr(form, "description"),
    dueDate: due ? new Date(due.length === 10 ? `${due}T09:00:00` : due) : null,
    priority,
    assigneeId: optStr(form, "assigneeId"),
    clientId: optStr(form, "clientId"),
    appointmentId: optStr(form, "appointmentId"),
    quotationId: optStr(form, "quotationId"),
  };
}

export async function createTask(form: FormData) {
  return run(async () => {
    const user = await assertUser("task:edit");
    const data = parse(form);
    const t = await db.task.create({ data: { ...data, assigneeId: data.assigneeId ?? user.id, createdById: user.id } });
    await audit(user.id, "task.create", "Task", t.id, `Nuova attività: ${t.title}`);
    refresh(t.clientId);
  }, "Attività creata.");
}

export async function updateTask(id: string, form: FormData) {
  return run(async () => {
    await assertUser("task:edit");
    const t = await db.task.update({ where: { id }, data: parse(form) });
    refresh(t.clientId);
  }, "Attività aggiornata.");
}

export async function toggleTask(id: string) {
  return run(async () => {
    const user = await assertUser("task:edit");
    const t = await db.task.findUniqueOrThrow({ where: { id } });
    await db.task.update({ where: { id }, data: { completed: !t.completed, completedAt: t.completed ? null : new Date() } });
    if (!t.completed) await audit(user.id, "task.complete", "Task", id, `Completata: ${t.title}`);
    refresh(t.clientId);
  });
}

export async function deleteTask(id: string) {
  return run(async () => {
    await assertUser("task:edit");
    const t = await db.task.delete({ where: { id } });
    refresh(t.clientId);
  }, "Attività eliminata.");
}
