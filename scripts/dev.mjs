// Sviluppo: ricompila frontend e server a ogni modifica e riavvia il server.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
spawn(process.execPath, ['scripts/build.mjs', 'client', '--watch'], { cwd: root, stdio: 'inherit' });
spawn(process.execPath, ['scripts/build.mjs', 'server', '--watch'], { cwd: root, stdio: 'inherit' });
let srv, t;
const restart = () => { clearTimeout(t); t = setTimeout(() => { srv?.kill(); srv = spawn(process.execPath, ['--enable-source-maps', 'build/server.mjs'], { cwd: root, stdio: 'inherit' }); }, 300); };
setTimeout(() => { restart(); watch(path.join(root, 'build'), restart); }, 1500);
