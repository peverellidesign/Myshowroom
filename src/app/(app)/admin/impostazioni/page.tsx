import { RefreshCw } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { emailStatus } from "@/lib/email";
import { getEmailSettings, getExchangeRate, getSetting } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { ActionButton, ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/misc";
import { refreshLiveRate, saveEmailSettings, setManualRate, uploadHero } from "../actions";

export const metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  await requireUser("admin:settings");
  const [rate, email, site] = await Promise.all([getExchangeRate(), getEmailSettings(), getSetting<{ heroImageKey?: string; heroCredit?: string }>("site", {})]);
  const smtp = emailStatus();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card p-5">
        <h2 className="text-xl">Cambio EUR / CHF</h2>
        <p className="mt-1 text-sm text-soft">Usato per convertire i prezzi nei preventivi. La fonte è sempre indicata.</p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-selected px-4 py-3">
          <span className="text-2xl font-normal">1 EUR = {rate.eurToChf.toFixed(4)} CHF</span>
          <Badge tone={rate.source === "BCE" ? "success" : "warning"}>{rate.source === "BCE" ? "Verificato BCE" : "Manuale"}</Badge>
        </div>
        <p className="mt-2 text-xs text-muted">
          {rate.source === "BCE" ? `Tasso di riferimento BCE del ${rate.referenceDate}, aggiornato ${fmtDateTime(rate.updatedAt)}.` : `Impostato manualmente il ${fmtDateTime(rate.updatedAt)}. Non è un tasso verificato.`}
        </p>
        <ActionForm action={setManualRate} className="mt-4 flex gap-2">
          <input name="eurToChf" type="number" step="0.0001" min="0.3" max="3" defaultValue={rate.eurToChf} className="field" />
          <SubmitButton variant="secondary">Imposta manuale</SubmitButton>
        </ActionForm>
        <ActionButton action={refreshLiveRate} variant="secondary" size="md" className="mt-2 w-full">
          <RefreshCw size={15} /> Aggiorna dal tasso BCE
        </ActionButton>
      </section>

      <section className="card p-5">
        <h2 className="text-xl">Email</h2>
        <div className="mt-3 rounded-2xl bg-selected px-4 py-3 text-sm">
          {smtp.configured ? (
            <p>
              Server SMTP configurato: <strong className="font-medium">{smtp.host}</strong> · mittente {smtp.from}
            </p>
          ) : (
            <p className="text-warning">
              Invio non disponibile. Configura le variabili d&apos;ambiente <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> e <code>EMAIL_FROM</code> sul server (le credenziali non vengono salvate nel database).
            </p>
          )}
        </div>
        <ActionForm action={saveEmailSettings} className="mt-4 space-y-3">
          <label className="block">
            <span className="label">Indirizzo di risposta (facoltativo)</span>
            <input name="replyTo" type="email" defaultValue={email.replyTo} className="field" placeholder="Vuoto = email del consulente" />
          </label>
          <label className="block">
            <span className="label">Firma</span>
            <textarea name="signature" defaultValue={email.signature} rows={3} className="field" />
          </label>
          <SubmitButton className="w-full">Salva</SubmitButton>
        </ActionForm>
      </section>

      <section className="card p-5 lg:col-span-2">
        <h2 className="text-xl">Immagine di copertina</h2>
        <p className="mt-1 text-sm text-soft">Mostrata nella Home, nella pagina di accesso e nelle pagine di prenotazione.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-[280px_1fr]">
          <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-mist">
            {site.heroImageKey && <img src={`/api/files/${site.heroImageKey}`} alt="" className="h-full w-full object-cover" />}
          </div>
          <ActionForm action={uploadHero} resetOnSuccess className="space-y-3">
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required className="field py-2.5" />
            <input name="credit" defaultValue={site.heroCredit ?? ""} placeholder="Credito fotografico" className="field" />
            <SubmitButton>Carica immagine</SubmitButton>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
