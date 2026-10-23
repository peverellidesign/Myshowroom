// Build di produzione con esbuild: frontend (dist/), server (build/server.mjs) e demo autonoma (demo-dist/).
// Uso: node scripts/build.mjs [client|server|demo|all] [--watch]
import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] || 'all';
const watch = process.argv.includes('--watch');
const r = p => path.join(root, p);

const htmlPage = (template, { js, css, inline }) => {
  let html = readFileSync(r(template), 'utf8').replace(/<script type="module" src="[^"]*"><\/script>/, '');
  if (inline) html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '');
  const head = inline ? `<style>${css}</style>` : `<link rel="stylesheet" href="/${css}">`;
  const tail = inline ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : `<script src="/${js}" defer></script>`;
  return html.replace('</head>', () => `${head}</head>`).replace('</body>', () => `${tail}</body>`);
};

const clientOptions = {
  entryPoints: { app: r('src/main.tsx') }, bundle: true, minify: true, sourcemap: true, outdir: r('dist/assets'),
  entryNames: '[name]-[hash]', format: 'iife', target: ['safari15', 'chrome100', 'firefox100'], jsx: 'automatic',
  metafile: true, logLevel: 'info', define: { 'process.env.NODE_ENV': '"production"' },
};

async function client() {
  rmSync(r('dist'), { recursive: true, force: true });
  const writeHtml = res => {
    const out = Object.keys(res.metafile.outputs).map(f => path.relative(r('dist'), path.resolve(root, f)).replace(/\\/g, '/'));
    const js = out.find(f => f.endsWith('.js')), css = out.find(f => f.endsWith('.css'));
    writeFileSync(r('dist/index.html'), htmlPage('index.html', { js, css }));
    if (existsSync(r('public'))) cpSync(r('public'), r('dist'), { recursive: true });
  };
  if (watch) {
    const ctx = await esbuild.context({ ...clientOptions, entryNames: '[name]', minify: false, plugins: [{ name: 'html', setup(b) { b.onEnd(res => { if (!res.errors.length) writeHtml(res); }); } }] });
    await ctx.watch();
  } else writeHtml(await esbuild.build(clientOptions));
}

const serverOptions = {
  entryPoints: [r('server/node/index.ts')], bundle: true, platform: 'node', format: 'esm', target: 'node20',
  outfile: r('build/server.mjs'), packages: 'external', sourcemap: true, logLevel: 'info',
};
async function server() {
  if (watch) await (await esbuild.context(serverOptions)).watch();
  else await esbuild.build(serverOptions);
}

async function demo() {
  // Versione dimostrativa autonoma: lo stesso codice API gira nel browser con dati in IndexedDB.
  const textWorker = { name: 'pdf-worker-text', setup(b) { b.onLoad({ filter: /pdf\.worker\.min\.mjs$/ }, a => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' })); } };
  const res = await esbuild.build({ ...clientOptions, entryPoints: { demo: r('src/demo/main.tsx') }, outdir: r('demo-dist/tmp'), sourcemap: false, write: false, entryNames: '[name]', plugins: [textWorker], supported: { 'top-level-await': true } });
  const js = res.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = res.outputFiles.find(f => f.path.endsWith('.css')).text;
  rmSync(r('demo-dist'), { recursive: true, force: true });
  mkdirSync(r('demo-dist'), { recursive: true });
  writeFileSync(r('demo-dist/index.html'), htmlPage('index.html', { js, css, inline: true }));
  // variante per pubblicazione come artifact: solo contenuto (l'host aggiunge doctype/head/body)
  writeFileSync(r('demo-dist/myshowroom-demo.html'), `<title>myshowroom by Peverelli Design</title>\n<style>${css}\nbody{background:#fafaf8}</style>\n<div id="root"></div>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>\n`);
  console.log('demo-dist/index.html', Math.round((js.length + css.length) / 1024), 'KB');
}

if (target === 'client' || target === 'all') await client();
if (target === 'server' || target === 'all') await server();
if (target === 'demo') await demo();
