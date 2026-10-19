"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Modal } from "./ui/modal";
import { useToast } from "./ui/toast";
import { buttonClass } from "./ui/button";
import { ProductPicker, type PickerProduct } from "./product-picker";
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_LANGUAGE_LABELS, fmtBytes } from "@/lib/format";

function upload(form: FormData, onProgress: (p: number) => void) {
  return new Promise<{ ok: boolean; error?: string; documentId?: string; duplicate?: boolean }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ ok: false, error: `Errore di caricamento (${xhr.status}).` });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Connessione interrotta durante il caricamento." });
    xhr.send(form);
  });
}

/** "+ Carica documento": real PDF upload to persistent storage with metadata and product associations. */
export function DocumentUpload({
  products,
  brands,
  defaultProductIds = [],
  defaultBrandId,
  canConfidential,
  trigger,
  autoOpen,
}: {
  products: PickerProduct[];
  brands: { id: string; name: string }[];
  defaultProductIds?: string[];
  defaultBrandId?: string;
  canConfidential: boolean;
  trigger?: ReactNode;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return toast("Seleziona un file PDF.", true);
    const fd = new FormData(e.currentTarget);
    fd.set("file", file);
    setProgress(0);
    const res = await upload(fd, setProgress);
    setProgress(null);
    if (!res.ok) return toast(res.error ?? "Caricamento non riuscito.", true);
    toast(res.duplicate ? "PDF già presente: collegato senza duplicarlo." : "Documento caricato.");
    setOpen(false);
    setFile(null);
    setTitle("");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={trigger ? undefined : buttonClass("primary", "sm")}>
        {trigger ?? (
          <>
            <FileUp size={15} /> Carica documento
          </>
        )}
      </button>
      <Modal open={open} onClose={() => progress === null && setOpen(false)} title="Carica documento" wide>
        <form ref={ref} onSubmit={submit} className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#cfcfc9] bg-white px-6 py-8 text-center hover:border-ink/40">
            <FileUp size={26} strokeWidth={1.3} className="text-soft" />
            {file ? (
              <span className="text-[15px]">
                {file.name} <span className="text-soft">· {fmtBytes(file.size)}</span>
              </span>
            ) : (
              <>
                <span className="text-[15px]">Seleziona un PDF</span>
                <span className="text-xs text-muted">Da computer, iPhone o iPad · max 80 MB</span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
              }}
            />
          </label>
          <label className="block">
            <span className="label">Titolo del documento</span>
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required className="field" placeholder="Es. Catalogo generale 2026" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Categoria</span>
              <select name="category" className="field" defaultValue="CATALOGO_PRODOTTO">
                {Object.entries(DOCUMENT_CATEGORY_LABELS)
                  .filter(([k]) => canConfidential || k !== "LISTINO_PREZZI")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Lingua</span>
              <select name="language" className="field" defaultValue="IT">
                {Object.entries(DOCUMENT_LANGUAGE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Brand</span>
              <select name="brandId" className="field" defaultValue={defaultBrandId ?? ""}>
                <option value="">—</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="label">Prodotti associati</span>
            <ProductPicker products={products} defaultSelected={defaultProductIds} />
          </div>
          <label className="block">
            <span className="label">Note (facoltative)</span>
            <textarea name="description" rows={2} className="field" />
          </label>
          {canConfidential && (
            <label className="flex items-center gap-3 px-1 text-[15px]">
              <input type="checkbox" name="confidential" value="1" className="h-5 w-5 accent-[#222]" />
              Riservato (visibile solo a manager e amministratori). I listini prezzi sono sempre riservati.
            </label>
          )}
          {progress !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-selected">
              <div className="h-full bg-charcoal transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          <button type="submit" disabled={progress !== null} className={buttonClass("primary", "lg", "w-full")}>
            {progress !== null ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Caricamento {progress}%
              </>
            ) : (
              "Carica e salva"
            )}
          </button>
        </form>
      </Modal>
    </>
  );
}

/** Upload a new version of an existing document. */
export function DocumentVersionUpload({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>
        Sostituisci / nuova versione
      </button>
      <Modal open={open} onClose={() => progress === null && setOpen(false)} title="Nuova versione">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("documentId", documentId);
            setProgress(0);
            const res = await upload(fd, setProgress);
            setProgress(null);
            if (!res.ok) return toast(res.error ?? "Caricamento non riuscito.", true);
            toast("Nuova versione caricata.");
            setOpen(false);
            router.refresh();
          }}
        >
          <input type="file" name="file" accept="application/pdf,.pdf" required className="field py-2.5" />
          <label className="block">
            <span className="label">Nota sulla versione</span>
            <input name="note" className="field" placeholder="Es. Aggiornamento listino aprile" />
          </label>
          <p className="text-xs text-muted">La versione precedente resta nello storico e può essere ripristinata.</p>
          <button type="submit" disabled={progress !== null} className={buttonClass("primary", "md", "w-full")}>
            {progress !== null ? `Caricamento ${progress}%` : "Carica nuova versione"}
          </button>
        </form>
      </Modal>
    </>
  );
}
