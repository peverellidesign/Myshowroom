export type TemplateKey = "visita" | "preventivo" | "appuntamento" | "followup" | "disponibilita";

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  visita: "Dopo la visita in showroom",
  preventivo: "Invio preventivo",
  appuntamento: "Conferma appuntamento",
  followup: "Follow-up",
  disponibilita: "Disponibilità prodotto",
};

export type TemplateVars = {
  cliente: string;
  consulente: string;
  firma: string;
  numero?: string;
  totale?: string;
  showroom?: string;
  data?: string;
  prodotti?: string;
};

export function renderTemplate(key: TemplateKey, v: TemplateVars): { subject: string; body: string } {
  const saluto = `Gentile ${v.cliente},`;
  const chiusura = `\n\nResto a disposizione per qualsiasi chiarimento.\n\nCordiali saluti,\n${v.consulente}\n${v.firma}`;
  switch (key) {
    case "visita":
      return {
        subject: "Grazie per la visita in showroom — Peverelli Design",
        body: `${saluto}\n\ngrazie per averci fatto visita${v.showroom ? ` nel nostro showroom di ${v.showroom}` : ""}. È stato un piacere accompagnarla tra le nostre collezioni.${v.prodotti ? `\n\nCome concordato, riepilogo i prodotti che abbiamo visto insieme:\n${v.prodotti}` : ""}\n\nSarò lieto di preparare una proposta su misura per il suo progetto.${chiusura}`,
      };
    case "preventivo":
      return {
        subject: `La sua proposta Peverelli Design${v.numero ? ` — ${v.numero}` : ""}`,
        body: `${saluto}\n\ncome concordato, le invio in allegato la proposta${v.numero ? ` n. ${v.numero}` : ""} preparata per lei.${v.prodotti ? `\n\n${v.prodotti}` : ""}${v.totale ? `\n\nTotale indicativo: ${v.totale}.` : ""}\n\nI prezzi e la disponibilità dei pezzi in stock sono soggetti a conferma. Saremo felici di rivedere insieme ogni dettaglio, anche in showroom.${chiusura}`,
      };
    case "appuntamento":
      return {
        subject: "Conferma appuntamento — Peverelli Design",
        body: `${saluto}\n\nle confermo il nostro appuntamento${v.data ? ` di ${v.data}` : ""}${v.showroom ? ` presso lo showroom di ${v.showroom}` : ""}.\n\nIn caso di imprevisti, non esiti a contattarmi per riprogrammare.${chiusura}`,
      };
    case "followup":
      return {
        subject: "Il suo progetto con Peverelli Design",
        body: `${saluto}\n\nla contatto per sapere se ha avuto modo di valutare la nostra proposta${v.numero ? ` (${v.numero})` : ""} e se posso esserle utile con ulteriori informazioni, campioni di materiali o una nuova visita in showroom.${chiusura}`,
      };
    case "disponibilita":
      return {
        subject: "Disponibilità prodotti — Peverelli Design",
        body: `${saluto}\n\nle scrivo per aggiornarla sulla disponibilità dei prodotti di suo interesse:${v.prodotti ? `\n${v.prodotti}` : ""}\n\nSe desidera, posso riservare un pezzo a suo nome per alcuni giorni.${chiusura}`,
      };
  }
}
