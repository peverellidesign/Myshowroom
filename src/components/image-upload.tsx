"use client";

import { ActionForm, SubmitButton } from "./ui/action-form";
import type { ActionResult } from "@/lib/action";
import { IMAGE_KIND_LABELS } from "@/lib/format";

export function ImageUploadForm({
  action,
  configurations,
  onDone,
  withKind = true,
}: {
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  configurations?: { id: string; name: string }[];
  onDone?: () => void;
  withKind?: boolean;
}) {
  return (
    <ActionForm action={action} onSuccess={onDone} resetOnSuccess className="space-y-4">
      <input type="file" name="files" accept="image/jpeg,image/png,image/webp" multiple required className="field py-2.5" />
      {withKind && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Vista</span>
            <select name="kind" className="field" defaultValue="FRONTALE">
              {Object.entries(IMAGE_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {configurations && configurations.length > 0 && (
            <label className="block">
              <span className="label">Composizione (facoltativa)</span>
              <select name="configurationId" className="field" defaultValue="">
                <option value="">—</option>
                {configurations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <label className="block">
        <span className="label">Didascalia</span>
        <input name="caption" className="field" />
      </label>
      {withKind && (
        <label className="block">
          <span className="label">Credito fotografico</span>
          <input name="credit" className="field" placeholder="Es. © Produttore" />
        </label>
      )}
      <SubmitButton className="w-full">Carica immagini</SubmitButton>
    </ActionForm>
  );
}
