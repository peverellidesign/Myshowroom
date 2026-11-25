# Pubblicare morethere sull'App Store, senza Mac

L'app iOS è nella cartella `ios/`: è un progetto Xcode creato con [Capacitor](https://capacitorjs.com),
solo per iPhone, che apre `https://morethere-production.up.railway.app`. Ogni aggiornamento pubblicato
su Railway arriva quindi subito anche nell'app, senza una nuova revisione di Apple.

Non serve un Mac: l'app viene compilata e inviata ad Apple da un Mac nel cloud di GitHub, con il
workflow `.github/workflows/morethere-ios.yml`. Il repository è pubblico, quindi le macchine Mac
di GitHub sono gratuite.

Tutto il materiale per la scheda (testi, screenshot, risposte ai questionari) è in
[`docs/app-store/scheda.md`](app-store/scheda.md) e in `docs/app-store/screenshots/`.

---

## 1. Iscriviti all'Apple Developer Program (a tuo nome)

1. Serve un ID Apple con l'autenticazione a due fattori attiva. Va bene il tuo, oppure creane uno dedicato.
2. Scarica l'app **Apple Developer** sull'iPhone, entra con l'ID Apple e tocca **Iscriviti ora**.
   Dall'iPhone è la strada più rapida: ti chiede un documento d'identità e il pagamento dentro l'app.
   In alternativa, dal computer: developer.apple.com/programs/enroll.
3. Scegli **Individuo / Persona fisica** e paga 99 $ all'anno (circa 99 €).
4. L'approvazione arriva di solito in 24–48 ore, per email.

## 2. Registra l'identificativo dell'app

1. Su developer.apple.com → **Account** → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. **App IDs** → **App** → Description `morethere`, Bundle ID **Explicit** `app.morethere.ios`.
3. Non serve attivare altre funzioni. **Register**.

## 3. Crea l'app su App Store Connect

1. appstoreconnect.apple.com → **App** → **+** → **Nuova app**.
2. Piattaforma **iOS**, nome **morethere**, lingua principale **Italiano**, Bundle ID `app.morethere.ios`,
   SKU `morethere-ios`, accesso completo.
   Se il nome «morethere» è già preso, usa per esempio «morethere – scoperte»: il nome sotto l'icona resta «morethere».

## 4. Crea la chiave per la compilazione automatica

1. App Store Connect → **Utenti e accesso** → **Integrazioni** → **App Store Connect API** →
   **Chiavi del team** → **+**.
2. Nome `GitHub`, accesso **Amministratore**: serve perché Xcode possa creare da solo certificato e profilo di firma.
3. Scarica il file `AuthKey_XXXXXXXXXX.p8`: si può scaricare **una volta sola**, conservalo.
4. Annota il **Key ID** (accanto alla chiave) e l'**Issuer ID** (in alto nella pagina).
5. Il **Team ID** è su developer.apple.com → **Account** → **Membership details**.

## 5. Inserisci le chiavi su GitHub

Su github.com/peverellidesign/Myshowroom → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, quattro volte:

| Nome | Valore |
|---|---|
| `APPLE_TEAM_ID` | il Team ID (10 caratteri) |
| `ASC_KEY_ID` | il Key ID |
| `ASC_ISSUER_ID` | l'Issuer ID |
| `ASC_KEY_P8` | tutto il testo del file `.p8`, comprese le righe `-----BEGIN…` e `-----END…` |

I secrets restano cifrati e non sono visibili a nessuno, nemmeno nel repository pubblico.

## 6. Compila e invia

1. GitHub → **Actions** → **morethere iOS** → **Run workflow** → versione `1.0` → **Run**.
2. Dopo 10–20 minuti la compilazione è su App Store Connect. Apple impiega altri 10–30 minuti a
   prepararla, poi la vedi in **TestFlight**.
3. Provala sul tuo iPhone: in TestFlight aggiungi te stesso come tester interno e installa l'app
   **TestFlight** dall'App Store.

Se il workflow si ferma con un errore, mandami il testo dell'errore e lo sistemo.

## 7. Compila la scheda e invia alla revisione

In App Store Connect, nella versione 1.0:

1. Copia testi, URL e categorie da [`scheda.md`](app-store/scheda.md).
2. Carica i sei screenshot di `docs/app-store/screenshots/` nel riquadro **iPhone 6,9"**.
3. Compila **Privacy dell'app** e **Classificazione per età** come indicato nella scheda.
4. **Compilazione**: scegli quella arrivata da GitHub.
5. **Accesso per la revisione**: un account dimostrativo con dei contenuti. Te lo preparo io quando sei pronto,
   così è nuovo e non scade. Le note per i revisori sono già scritte nella scheda.
6. **Aggiungi per la revisione** → **Invia**. La risposta arriva di solito in 1–3 giorni.

## Cosa è già pronto

- Progetto Xcode in `ios/App` (Capacitor 7, Swift Package Manager), solo iPhone, solo verticale.
- Icona 1024×1024 e schermata d'avvio con il logo.
- Testi delle autorizzazioni in italiano: fotocamera, libreria foto e posizione («Sono qui»).
- Dichiarazione sulla crittografia (`ITSAppUsesNonExemptEncryption = NO`): niente domanda all'invio.
- Pagine pubbliche: [privacy](https://morethere-production.up.railway.app/privacy.html) e
  [supporto e regole d'uso](https://morethere-production.up.railway.app/support.html).
- Nell'app: cancellazione dell'account, export dei dati, «Rimuovi dal mio Circle» per bloccare e
  «Segnala» nella pagina di ogni persona, come Apple chiede alle app in cui le persone si scambiano contenuti.

## Da sapere sulla revisione

- **Linea guida 4.2.** Apple rifiuta le app che sono solo «un sito dentro una cornice». morethere ha una
  navigazione da app nativa e usa fotocamera, foto e posizione, ma il rischio non è zero. Senza
  connessione l'app nativa non si apre, perché carica l'interfaccia dal server. Se la revisione lo
  contesta, i passi successivi sono:
  - l'estensione di condivisione iOS, per mandare a morethere un post da Instagram o TikTok dal tasto «Condividi»;
  - le notifiche push;
  - l'interfaccia inclusa nell'app invece che caricata dal server.
- **Segnalazioni.** Nella pagina di supporto è scritto che le segnalazioni ricevono risposta entro 24 ore:
  le email arrivano a matteopeverelli97@gmail.com.

## Aggiornare l'app

- Cambi all'interfaccia o alle funzioni: basta pubblicarli su Railway, come sempre.
- Cambi a icona, nome, autorizzazioni o versione di Capacitor: rilancia il workflow con una versione
  nuova (es. `1.1`), poi invia la nuova versione alla revisione.
