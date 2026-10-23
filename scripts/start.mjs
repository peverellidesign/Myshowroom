// Avvio in produzione (GoDaddy Node.js Hosting, Render, server propri).
// Se la piattaforma non ha eseguito "npm run build", compila prima di partire.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV ||= 'production';
if (!existsSync(path.join(root, 'build/server.mjs')) || !existsSync(path.join(root, 'dist/index.html'))) {
  console.log('[myshowroom] build mancante: compilazione in corso…');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build.mjs'), 'all'], { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
await import(pathToFileURL(path.join(root, 'build/server.mjs')).href);
