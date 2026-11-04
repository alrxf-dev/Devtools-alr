// Production build: esbuild only. Workers are bundled first (self-contained, hashed names) so the app can embed their URLs.
import { build } from 'esbuild';
import { rm, mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSP } from './csp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const dev = process.argv.includes('--dev');

const common = {
  absWorkingDir: root,
  bundle: true,
  target: 'es2022',
  minify: !dev,
  sourcemap: dev ? 'linked' : false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
};

export async function buildAll() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(path.join(dist, 'assets'), { recursive: true });

  const workerEntries = {
    compute: 'src/workers/compute.worker.ts',
    regex: 'src/workers/regex.worker.ts',
    pdfjs: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  };
  const wres = await build({
    ...common,
    entryPoints: workerEntries,
    outdir: 'dist/assets',
    entryNames: 'worker-[name]-[hash]',
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const workerUrl = {};
  for (const out of Object.keys(wres.metafile.outputs)) {
    const m = /worker-(compute|regex|pdfjs)-/.exec(path.basename(out));
    if (m && out.endsWith('.js')) workerUrl[m[1]] = './assets/' + path.basename(out);
  }
  for (const k of Object.keys(workerEntries)) if (!workerUrl[k]) throw new Error('worker not built: ' + k);

  const ares = await build({
    ...common,
    entryPoints: { app: 'src/main.tsx' },
    outdir: 'dist/assets',
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'media/[name]-[hash]',
    splitting: true,
    format: 'esm',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.woff': 'file', '.woff2': 'file', '.svg': 'file' },
    define: {
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
      __WORKER_COMPUTE__: JSON.stringify(workerUrl.compute),
      __WORKER_REGEX__: JSON.stringify(workerUrl.regex),
      __WORKER_PDFJS__: JSON.stringify(workerUrl.pdfjs),
      __APP_VERSION__: JSON.stringify(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version),
    },
  });

  let js = '', css = '';
  for (const [out, meta] of Object.entries(ares.metafile.outputs)) {
    if (meta.entryPoint === 'src/main.tsx') {
      js = './' + path.relative(dist, path.join(root, out)).split(path.sep).join('/');
      if (meta.cssBundle) css = './' + path.relative(dist, path.join(root, meta.cssBundle)).split(path.sep).join('/');
    }
  }
  if (!js || !css) throw new Error('entry outputs missing');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#080C16">
<meta name="google-site-verification" content="bqzXGz409O03AKsj25UC8OYurNJKX5tF-8lpOiwV6Sg" />
<meta name="description" content="ALRECT FILE TOOLS: 151 file, text, data, image, PDF, audio, video, developer and security tools that run in your browser. Files are not uploaded.">
<title>ALRECT FILE TOOLS</title>
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${css}">
</head>
<body>
<div id="root"></div>
<noscript><p style="font-family:sans-serif;padding:2rem;color:#F0F5FF;background:#080C16">ALRECT FILE TOOLS needs JavaScript to run its tools in your browser. Nothing is uploaded; there is no server component.</p></noscript>
<script type="module" src="${js}"></script>
</body>
</html>
`;
  await writeFile(path.join(dist, 'index.html'), html);
  if (existsSync(path.join(root, 'public'))) await cp(path.join(root, 'public'), dist, { recursive: true });
  return { js, css, workerUrl };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  buildAll().then((r) => console.log(`built in ${Date.now() - t0} ms ->`, r.js, r.css)).catch((e) => { console.error(e); process.exit(1); });
}
