# Pubblicare morethere sull'App Store

morethere è già pronta come app iOS nativa nella cartella `ios/`: è un progetto Xcode
creato con [Capacitor](https://capacitorjs.com). L'app nativa apre
`https://morethere-production.up.railway.app`, quindi ogni aggiornamento pubblicato su
Railway arriva subito anche nell'app, senza passare di nuovo dalla revisione di Apple.

## Cosa è già fatto

- Progetto Xcode in `ios/App` (Capacitor 7, Swift Package Manager: non serve CocoaPods).
- Nome dell'app **morethere**, identificativo `app.morethere.ios` (si può cambiare, vedi sotto).
- Icona 1024×1024 e schermata d'avvio con il logo.
- Solo verticale su iPhone; su iPad tutte le orientazioni.
- Testi delle autorizzazioni, obbligatori, in italiano: fotocamera, libreria foto e posizione («Sono qui»).
- Dichiarazione sulla crittografia (`ITSAppUsesNonExemptEncryption = NO`): niente domanda all'invio.
- Informativa privacy pubblica: `https://morethere-production.up.railway.app/privacy.html`.
- Cancellazione dell'account dall'interno dell'app: Profilo → «Elimina il mio account».

## Cosa serve a te

1. **Un Mac con Xcode** (gratis dal Mac App Store, versione 16 o successiva).
2. **Un account Apple Developer**: 99 $ all'anno, su developer.apple.com/programs. Se lo
   intesti a un'azienda serve anche il numero D-U-N-S.
3. **Un indirizzo email di contatto** da scrivere nell'informativa privacy
   (`public/privacy.html`, dove ora c'è «[indirizzo email da inserire]»).

## Passi

1. Scarica il repository sul Mac, poi nella cartella `morethere`:
   ```
   npm install
   npm run build
   npx cap sync ios
   npx cap open ios
   ```
   Si apre Xcode con il progetto.
2. In Xcode, seleziona il progetto **App** → target **App** → **Signing & Capabilities**:
   - **Team**: il tuo account Apple Developer;
   - **Bundle Identifier**: lascia `app.morethere.ios` o metti il tuo (es. `com.tuodominio.morethere`);
     se lo cambi, cambialo anche in `capacitor.config.json` (`appId`).
3. Prova sul tuo iPhone: collegalo con il cavo, sceglilo in alto e premi ▶︎.
4. Su [App Store Connect](https://appstoreconnect.apple.com) → **App** → **+** → **Nuova app**:
   nome «morethere», lingua principale Italiano, lo stesso Bundle ID.
5. In Xcode: **Product → Archive**, poi **Distribute App → App Store Connect → Upload**.
6. In App Store Connect compila la scheda:
   - **URL informativa privacy**: `https://morethere-production.up.railway.app/privacy.html`;
   - **Privacy dell'app** («Etichette nutrizionali»): dati raccolti = Informazioni di contatto
     (email, nome), Contenuti dell'utente (foto, altri contenuti), Posizione approssimativa;
     tutti collegati all'utente, nessuno usato per il tracciamento;
   - **Screenshot**: iPhone 6,9" (1320×2868) e, se pubblichi anche per iPad, iPad 13";
   - **Accesso per la revisione**: crea un account di prova con qualche scoperta e un amico,
     e scrivi email e password nelle note per i revisori, che senza account non possono entrare.
7. **Invia per la revisione.** Di solito la risposta arriva in 1–3 giorni.

## Da sapere sulla revisione

Apple rifiuta le app che sono solo «un sito dentro una cornice» (linea guida 4.2). morethere
ha una navigazione da app nativa e usa fotocamera, foto e posizione, ma il rischio non è zero.
Senza connessione l'app nativa non si apre, perché carica l'interfaccia dal server. Se la revisione lo chiede, i passi successivi sono:

- l'estensione di condivisione iOS, per mandare a morethere un post da Instagram o TikTok
  dal pulsante «Condividi»;
- le notifiche push (un amico ti ha aperto un ricordo, ti hanno risposto con dei consigli);
- l'interfaccia inclusa nell'app invece che caricata dal server.

## Aggiornare l'app nativa

- Cambi all'interfaccia o alle funzioni: basta pubblicarli su Railway, come sempre.
- Cambi a icona, nome, autorizzazioni o versione di Capacitor: `npx cap sync ios`, poi un
  nuovo archivio da Xcode (aumenta **Version** o **Build** in *General*).
