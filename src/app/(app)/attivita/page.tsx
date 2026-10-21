import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { APPOINTMENT_TYPE_LABELS, TASK_PRIORITY_LABELS, fmtDate, fmtDateTime } from "@/lib/format";
import { TaskForm } from "@/components/task-form";
import { ModalButton } from "@/components/ui/modal";
import { ActionButton } from "@/components/ui/action-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { createTask, deleteTask, toggleTask, updateTask } from "./actions";

export const metadata = { title: "Attività" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const user = await requireUser();
  const { vista = "mie" } = await searchParams;
  const where: Prisma.TaskWhereInput =
    vista === "tutte" ? {} : vista === "completate" ? { completed: true } : { completed: false, OR: [{ assigneeId: user.id }, { assigneeId: null }] };
  const [tasks, users, clients, appointments, quotations] = await Promise.all([
    db.task.findMany({
      where,
      include: { assignee: true, client: true, quotation: true, appointment: true },
      orderBy: [{ completed: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.appointment.findMany({ where: { startsAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, include: { client: true }, orderBy: { startsAt: "asc" }, take: 100 }),
    db.quotation.findMany({ include: { client: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  const opts = {
    users: users.map((u) => ({ id: u.id, name: u.name })),
    clients,
    appointments: appointments.map((a) => ({ id: a.id, name: `${fmtDateTime(a.startsAt)} · ${a.client?.name ?? APPOINTMENT_TYPE_LABELS[a.type]}` })),
    quotations: quotations.map((q) => ({ id: q.id, name: `${q.number}${q.client ? ` · ${q.client.name}` : ""}` })),
  };
  const done = tasks.filter((t) => t.completed).length;
  const now = new Date();

  return (
    <div className="mx-auto max-w-4xl animate-fadein">
      <PageHeader eyebrow="07 / Task management" title="Le attività." subtitle="Niente viene dimenticato." />
      <div className="card mb-5 p-5">
        <TaskForm action={createTask} {...opts} />
      </div>
      <div className="mb-4 flex gap-2">
        {[
          ["mie", "Da fare"],
          ["completate", "Completate"],
          ["tutte", "Tutte"],
        ].map(([k, l]) => (
          <Link key={k} href={`/attivita?vista=${k}`} className={cn("chip", vista === k && "chip-active")}>
            {l}
          </Link>
        ))}
      </div>
      {tasks.length === 0 ? (
        <EmptyState title="Niente in sospeso" text="Tutte le attività sono completate." />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const overdue = !t.completed && t.dueDate && t.dueDate < now;
            return (
              <div key={t.id} className="card flex items-start gap-4 p-4 sm:p-5">
                <ActionButton action={toggleTask.bind(null, t.id)} variant="ghost" size="icon" className="-m-1.5 shrink-0" title={t.completed ? "Segna da fare" : "Completa"}>
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border", t.completed ? "border-charcoal bg-charcoal text-white" : "border-[#C4C7C7]")}>
                    {t.completed && <Check size={15} />}
                  </span>
                </ActionButton>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[17px]", t.completed && "text-muted line-through")}>{t.title}</p>
                  {t.description && <p className="text-sm text-soft">{t.description}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span className={cn(overdue && "text-danger")}>{t.dueDate ? `Scadenza ${fmtDate(t.dueDate)}` : "Senza scadenza"}</span>
                    {t.priority === "ALTA" && <Badge tone="danger">Priorità alta</Badge>}
                    {t.priority === "BASSA" && <Badge tone="outline">{TASK_PRIORITY_LABELS.BASSA}</Badge>}
                    {t.assignee && <span>{t.assignee.name}</span>}
                    {t.client && (
                      <Link href={`/clienti/${t.client.id}`} className="link-quiet">
                        {t.client.name}
                      </Link>
                    )}
                    {t.quotation && (
                      <Link href={`/preventivi/${t.quotation.id}`} className="link-quiet">
                        {t.quotation.number}
                      </Link>
                    )}
                    {t.appointment && <span>Appunt. {fmtDateTime(t.appointment.startsAt)}</span>}
                  </div>
                </div>
                <ModalButton label={<Pencil size={15} />} title="Modifica attività" className="rounded-full p-2 text-soft hover:bg-selected">
                  <TaskForm
                    action={updateTask.bind(null, t.id)}
                    {...opts}
                    values={{ ...t, dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "" }}
                  />
                </ModalButton>
                <ActionButton action={deleteTask.bind(null, t.id)} variant="ghost" size="icon" confirm="Eliminare l'attività?" title="Elimina">
                  <X size={16} />
                </ActionButton>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-sm text-soft">
        {done} di {tasks.length} completate
      </p>
    </div>
  );
}
