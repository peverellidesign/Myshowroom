# Registrazione, conferma email e password dimenticata

L'app è pronta: chi apre un link d'invito arriva direttamente su "Crea account",
riceve l'email di conferma e, aprendo il link (anche da un altro telefono),
entra e trova l'invito ad aspettarlo. "Password dimenticata?" manda un link per
sceglierne una nuova.

Restano tre impostazioni da fare **una volta** nella dashboard di Supabase.

## 1. Indirizzo dell'app

Authentication → URL Configuration
(https://supabase.com/dashboard/project/ptcexacciemeiykavbpb/auth/url-configuration)

- **Site URL:** `https://morethere-production.up.railway.app`
- **Redirect URLs:** aggiungi `https://morethere-production.up.railway.app/**`

Senza questo, i link nelle email portano a un indirizzo sbagliato.

## 2. Invio delle email (SMTP)

Il servizio email incluso in Supabase manda email **solo ai membri del tuo
team Supabase** e al massimo poche all'ora: gli amici che inviti non le
ricevono. Serve un servizio di invio vero.

Authentication → Emails → SMTP Settings → **Enable custom SMTP**
(https://supabase.com/dashboard/project/ptcexacciemeiykavbpb/auth/smtp)

Soluzione più rapida, con il tuo Gmail:

1. Attiva la verifica in due passaggi su https://myaccount.google.com/security
2. Crea una password per app su https://myaccount.google.com/apppasswords
   (nome: "morethere"). Ti dà 16 lettere.
3. In Supabase:
   - Sender email: il tuo indirizzo Gmail
   - Sender name: `morethere`
   - Host: `smtp.gmail.com`
   - Port: `465`
   - Username: il tuo indirizzo Gmail
   - Password: le 16 lettere del punto 2

Gmail permette circa 500 email al giorno. Quando avrai un dominio (per esempio
`morethere.app`) conviene passare a Resend o Postmark, così le email partono da
`ciao@morethere.app`.

Dopo aver attivato l'SMTP, in Authentication → Rate Limits alza
"Rate limit for sending emails" (per esempio a 30 all'ora).

## 3. Testi delle email in italiano

Authentication → Emails → Templates
(https://supabase.com/dashboard/project/ptcexacciemeiykavbpb/auth/templates)

### Confirm signup

Oggetto: `Conferma il tuo account morethere`

```html
<div style="font-family:Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#232323;background:#ffffff">
  <p style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px">morethere</p>
  <p style="font-size:13px;color:#777;margin:0 0 32px">Your world. Your people. Your intelligence.</p>
  <p style="font-size:17px;line-height:1.5;margin:0 0 24px">Ciao! Tocca il pulsante per attivare il tuo account.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#232323;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:500">Attiva l'account</a>
  <p style="font-size:13px;line-height:1.5;color:#777;margin:32px 0 0">Il link funziona anche da un altro telefono o computer. Se non ti sei registrato tu, ignora questa email.</p>
</div>
```

### Reset password

Oggetto: `Scegli una nuova password per morethere`

```html
<div style="font-family:Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#232323;background:#ffffff">
  <p style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px">morethere</p>
  <p style="font-size:13px;color:#777;margin:0 0 32px">Your world. Your people. Your intelligence.</p>
  <p style="font-size:17px;line-height:1.5;margin:0 0 24px">Hai chiesto di cambiare la password. Tocca il pulsante e scegline una nuova.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#232323;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:500">Scegli la nuova password</a>
  <p style="font-size:13px;line-height:1.5;color:#777;margin:32px 0 0">Il link vale un'ora e si usa una volta sola. Se non sei stato tu, ignora questa email: la tua password resta quella di prima.</p>
</div>
```

### Change email address

Oggetto: `Conferma il nuovo indirizzo email`

```html
<div style="font-family:Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#232323;background:#ffffff">
  <p style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0 0 32px">morethere</p>
  <p style="font-size:17px;line-height:1.5;margin:0 0 24px">Conferma che vuoi usare {{ .NewEmail }} per accedere a morethere.</p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#232323;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:500">Conferma</a>
</div>
```

## Come invitare qualcuno

Your Circle → More of me → **Aggiungi** → **Invita con un link**. Manda il
link (WhatsApp, SMS, email). Vale una volta e scade dopo 7 giorni.
