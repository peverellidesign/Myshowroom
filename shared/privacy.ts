// Informativa privacy predefinita (art. 13 Regolamento UE 2016/679 – GDPR) per i clienti degli showroom.
// BOZZA da completare e far verificare dal consulente privacy / DPO: i campi tra [parentesi quadre]
// vanno sostituiti con i dati reali della società. L'amministratore la modifica dalla sezione Clienti.

export const DEFAULT_PRIVACY_TEXT = `INFORMATIVA SUL TRATTAMENTO DEI DATI PERSONALI
ai sensi dell'art. 13 del Regolamento (UE) 2016/679 ("GDPR")

1. Titolare del trattamento
[RAGIONE SOCIALE] – Peverelli Design, con sede legale in [INDIRIZZO SEDE LEGALE], P.IVA [P.IVA], email [EMAIL PRIVACY] ("Titolare"), per gli showroom di Como, Milano Brera, Lugano e Dubai.

2. Dati trattati
Dati anagrafici e di contatto (nome, cognome, azienda, ruolo, telefono, email, indirizzo), anche ricavati dal biglietto da visita da Lei consegnato; informazioni sulle Sue preferenze di arredo, richieste, preventivi e appuntamenti; firma apposta sul presente modulo.

3. Finalità e basi giuridiche
a) Gestire le Sue richieste, gli appuntamenti, i preventivi, la vendita, la consegna e l'assistenza: base giuridica l'esecuzione di misure precontrattuali e del contratto (art. 6.1.b GDPR).
b) Adempiere agli obblighi di legge, fiscali e contabili: base giuridica l'obbligo legale (art. 6.1.c GDPR).
c) Solo con il Suo consenso facoltativo, inviarLe comunicazioni commerciali, newsletter, novità sui prodotti e inviti a eventi e presentazioni, via email, telefono o messaggi: base giuridica il consenso (art. 6.1.a GDPR), revocabile in ogni momento senza pregiudicare la liceità del trattamento precedente.

4. Natura del conferimento
Il conferimento dei dati per le finalità a) e b) è necessario: senza di essi non potremo dare seguito alle Sue richieste. Il consenso per la finalità c) è facoltativo e il rifiuto non ha alcuna conseguenza sul rapporto con noi.

5. Modalità del trattamento e destinatari
I dati sono trattati con strumenti elettronici, con misure di sicurezza adeguate, dal personale autorizzato degli showroom. Possono essere comunicati a fornitori di servizi informatici (hosting, posta elettronica, gestionale), a vettori e montatori, ai produttori dei marchi trattati quando necessario per gli ordini, a consulenti fiscali e legali; tali soggetti agiscono come responsabili del trattamento o titolari autonomi. I dati non sono diffusi.

6. Trasferimento dei dati fuori dall'Unione Europea
Alcuni fornitori e gli showroom di Lugano (Svizzera) e Dubai (Emirati Arabi Uniti) possono trattare i dati fuori dall'UE. Il trasferimento avviene sulla base di decisioni di adeguatezza della Commissione Europea o di garanzie adeguate (clausole contrattuali tipo, art. 46 GDPR).

7. Conservazione
Finalità a): per la durata del rapporto e successivamente per 10 anni per gli obblighi di legge (finalità b). Finalità c): fino alla revoca del consenso e comunque non oltre 24 mesi dall'ultimo contatto.

8. I Suoi diritti
Può chiedere in ogni momento l'accesso ai dati, la rettifica, la cancellazione, la limitazione, la portabilità, opporsi al trattamento e revocare il consenso (artt. 15-22 GDPR), scrivendo a [EMAIL PRIVACY]. Ha inoltre il diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it) o all'autorità del Paese in cui risiede o lavora.`;

export const CONSENT_SERVICE = "Dichiaro di aver ricevuto e letto l'informativa sul trattamento dei dati personali.";
export const CONSENT_MARKETING = "Comunicazioni commerciali, newsletter e inviti a eventi (finalità c)";

/** Versione dell'informativa: impronta del testo, così ogni modulo firmato indica esattamente quale testo è stato accettato. */
export async function privacyVersion(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text.trim()));
  return [...new Uint8Array(d)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}
