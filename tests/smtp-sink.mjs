// Server SMTP di test: riceve le email e le salva come .eml (verifica reale dell'invio con allegati).
import net from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function startSmtpSink(port, dir) {
  mkdirSync(dir, { recursive: true });
  const messages = [];
  const server = net.createServer(sock => {
    let buf = '', inData = false, data = '', env = { from: '', to: [] };
    sock.write('220 sink ESMTP\r\n');
    sock.on('data', chunk => {
      buf += chunk.toString('latin1');
      while (true) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) { data += buf; buf = ''; return; }
          data += buf.slice(0, end); buf = buf.slice(end + 5); inData = false;
          const raw = data.replace(/\r\n\.\./g, '\r\n.');
          const file = path.join(dir, `${Date.now()}-${messages.length}.eml`);
          writeFileSync(file, raw, 'latin1');
          messages.push({ ...env, raw, file });
          data = ''; env = { from: '', to: [] };
          sock.write('250 OK queued\r\n');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) return;
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-sink\r\n250-8BITMIME\r\n250 SIZE 52428800\r\n');
        else if (cmd === 'MAIL') { env.from = line; sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { env.to.push(line); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { inData = true; sock.write('354 End with .\r\n'); }
        else if (cmd === 'QUIT') { sock.end('221 Bye\r\n'); }
        else sock.write('250 OK\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise(res => server.listen(port, '127.0.0.1', () => res({ messages, close: () => server.close() })));
}

if (process.argv[1] && process.argv[1].endsWith('smtp-sink.mjs')) {
  const port = Number(process.argv[2] || 2525);
  startSmtpSink(port, process.argv[3] || './data/mail-sink').then(() => console.log('SMTP sink su porta', port));
}
