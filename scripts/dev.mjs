// Development: rebuild on demand and serve. Simple on purpose: it rebuilds when any file under src/ changes.
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { startServer } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.argv.push('--dev');
let building = false, again = false;
async function rebuild() {
  if (building) { again = true; return; }
  building = true;
  try { await buildAll(); console.log('rebuilt', new Date().toLocaleTimeString()); } catch (e) { console.error(e.message); }
  building = false;
  if (again) { again = false; rebuild(); }
}
await rebuild();
let t;
watch(path.join(root, 'src'), { recursive: true }, () => { clearTimeout(t); t = setTimeout(rebuild, 150); });
const s = await startServer(path.join(root, 'dist'), Number(process.env.PORT ?? 5173));
console.log(`dev server: http://127.0.0.1:${s.port}/`);
