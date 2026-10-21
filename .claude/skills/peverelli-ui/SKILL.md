---
name: peverelli-ui
description: Design system e checklist UI/UX di myshowroom by Peverelli Design. Usala PRIMA di creare o modificare qualsiasi schermata, componente, colore, testo dell'interfaccia o layout (src/app, src/components, globals.css, tailwind.config.ts), e per fare una revisione UI/UX con screenshot su telefono, tablet e desktop.
---

# myshowroom — design system Peverelli

L'app deve sembrare un'estensione di peverellicode.com: bianco puro, grigi freddi,
antracite profondo, fotografia protagonista, tipografia grotesk regolare, niente decorazioni.
Uso principale: venditori in showroom su **iPhone e iPad**, spesso con una mano sola,
davanti al cliente. Ogni schermata deve essere bella da mostrare al cliente.

## 1. Colori (solo token, mai hex nel codice)

Definiti in `tailwind.config.ts`. Non introdurre colori nuovi né hex arbitrari (`bg-[#...]`):
se manca un token, aggiungilo lì.

| Token | Hex | Uso |
|---|---|---|
| `canvas` / `card` | #FFFFFF | sfondo app, card |
| `surface` | #F7F7F7 | aree secondarie, hover righe, miniature PDF |
| `mist` / `selected` | #ECEDEF | segnaposto foto, skeleton, chip attivi chiari, avatar |
| `line` | #DDDDDD | bordi, divisori (1px) |
| `ink` | #161A1A | testo principale, icone |
| `soft` | #5F6363 | testo secondario |
| `muted` | #707070 | etichette, eyebrow, metadati (min. per contrasto AA) |
| `charcoal` | #292E2E | pulsante primario, tab attivo, badge scuri |
| `night` | #161A1A | sfondi scuri pieni (hero, login) |
| `danger` / `success` / `warning` / `info` | — | solo stati: errori, disponibile, riservato, in trasferimento |

Regole:
- Il colore d'accento è il **nero/antracite**. Nessun blu, nessun beige caldo.
- I colori di stato si usano solo per lo stato, mai come decorazione.
- Contrasto testo ≥ 4.5:1 (testo su foto: sempre velatura scura o pill bianca).

## 2. Tipografia

- Font: Inter Variable (equivalente libero di Aktiv Grotesk usato dal sito).
- Pesi: **400** per titoli e testo, 500 per eyebrow/etichette/pulsanti piccoli. Niente 300, niente bold pesanti.
- Titoli: tracking negativo (`tracking-[-0.02em]`…`[-0.03em]`), interlinea stretta.
- Scala: display 34/46 · pagina 28–36 · sezione 22/26 · corpo 15–16 · meta 13 · eyebrow 11 maiuscolo `tracking-[0.14em]`.
- Input sempre ≥ 16px su mobile (evita lo zoom di iOS).
- Numeri in tabelle/prezzi: `tabular-nums`. Prezzi con `money()` di `src/lib/format.ts`.

## 3. Componenti e pattern

- Pulsanti: `buttonClass()` di `src/components/ui/button.tsx`. Primario antracite a pillola; secondario bordo `line`.
  Un solo primario per schermata/area. Etichette esplicite con verbo ("Aggiungi al preventivo", non "Al preventivo").
- Link di sezione stile Peverelli: classe `.link-line` → "—— VEDI TUTTO".
- Card: `.card` (bordo sottile, ombra quasi assente). Raggi: foto 20px, miniature 12–14px, sheet 24–28px.
- Foto prodotto: `ProductCard` / `ProductMasonry` / `Gallery`. Mai stirare o tagliare male: rispetta `photoRatio()`.
  Su mobile le gallerie vanno a tutta larghezza (`bleed`).
- Modali = bottom sheet su mobile (`ui/modal.tsx`). Feedback tocco: `.pressable`.
- Stati obbligatori per ogni lista/pagina: caricamento (`skeletons.tsx`), vuoto (`EmptyState` con azione), errore (toast/inline in `text-danger`).
- Dati demo sempre marcati con `DemoBadge`.

## 4. Layout mobile/tablet

- Progetta prima a **390px**, poi 820px (iPad verticale), poi 1280px.
- Margini laterali 16px (mobile) / 24px (tablet). Nessuno scroll orizzontale della pagina.
- Bersagli tocco ≥ 44×44px. Azioni principali raggiungibili col pollice (barra fissa in basso sopra la tab bar).
- Rispetta le safe area (`env(safe-area-inset-*)`) per notch e home indicator.
- Header sticky trasparente sopra le hero, poi bianco sfocato.

## 5. Testi (italiano)

- Tono: professionale, caldo, breve. Dai del "tu" all'utente interno.
- Nessun gergo tecnico, nessuna abbreviazione ambigua. Date `fmtDate`, valute EUR/CHF sempre esplicite.
- Messaggi d'errore: cosa è successo + cosa fare.

## 6. Procedura di revisione (da fare prima di ogni commit UI)

1. `npx tsc --noEmit` e `npm run lint`.
2. Avvia l'app (`npm run dev`, DB Postgres attivo) e fai screenshot con Playwright
   (in questo ambiente: `NODE_PATH=/opt/node-tools/node_modules`, `executablePath: '/opt/pw-browsers/chromium'`)
   a 390×844, 820×1180 e 1280×800 delle pagine toccate. Guardali davvero.
3. Controlla per ogni screenshot:
   - [ ] nessun overflow orizzontale (`document.documentElement.scrollWidth <= innerWidth`)
   - [ ] nessun testo tagliato male o sovrapposto, nessuna parola a capo da sola nei pulsanti
   - [ ] foto con proporzioni corrette, niente bande vuote
   - [ ] un solo pulsante primario evidente, gerarchia chiara
   - [ ] solo token colore, nessun residuo beige/caldo
   - [ ] stati vuoto/caricamento/errore presenti
4. `grep -rnE 'bg-\[#|text-\[#|border-\[#' src` deve restituire solo eccezioni motivate.
