/* End-to-end runner: builds the app, serves dist/, and drives every tool through a real Chromium. */
import { chromium, type Browser } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../../scripts/build.mjs';
import { startServer } from '../../scripts/serve.mjs';
import { runCase, type Case } from './harness';
import { textCases } from './cases/text';
import { dataCases } from './cases/data';
import { developerCases } from './cases/developer';
import { securityCases } from './cases/security';
import { filesCases } from './cases/files';
import { archiveCases } from './cases/archive';
import { audioCases } from './cases/audio';
import { videoCases } from './cases/video';
import { imageCases } from './cases/image';
import { pdfCases } from './cases/pdf';
import { runUiChecks } from './ui';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GROUPS: Record<string, Case[]> = { text: textCases, data: dataCases, developer: developerCases, security: securityCases, files: filesCases, archive: archiveCases, audio: audioCases, video: videoCases, image: imageCases, pdf: pdfCases };
export const ALL_CASES: Case[] = Object.values(GROUPS).flat();

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const only = arg('only')?.split(',');
const groups = arg('group')?.split(',');
const skipBuild = process.argv.includes('--no-build');

async function main(): Promise<void> {
  if (!skipBuild) await buildAll();
  const srv = await startServer(path.join(root, 'dist'), 0);
  const base = `http://127.0.0.1:${srv.port}/`;
  const browser: Browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const cases = (groups ? groups.flatMap((g) => GROUPS[g] ?? []) : ALL_CASES).filter((c) => !only || only.includes(c.id));
  let pass = 0;
  const failures: string[] = [];
  const pageErrors: string[] = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  for (const c of cases) {
    const page = await ctx.newPage();
    const errs: string[] = [];
    if (process.env.E2E_DEBUG) page.on('console', (m) => console.log('  [console]', m.type(), m.text().slice(0, 200)));
    page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
    const problems = await runCase(page, base, c);
    // Intentional error cases make the tool show a message but must never raise page errors.
    const real = errs.filter((e) => !/Failed to load resource/.test(e));
    problems.push(...real);
    await page.close();
    const label = `${c.id}${c.name ? ` [${c.name}]` : ''}`;
    if (problems.length === 0) { pass++; console.log(`ok   ${label}`); }
    else { failures.push(label); console.log(`FAIL ${label}\n       ${problems.join('\n       ')}`); pageErrors.push(...real); }
  }
  if (!only && !groups) {
    for (const u of await runUiChecks(browser, base)) {
      cases.push(null as never);
      if (u.problems.length === 0) { pass++; console.log(`ok   ui: ${u.name}`); } else { failures.push(`ui: ${u.name}`); console.log(`FAIL ui: ${u.name}\n       ${u.problems.join('\n       ')}`); }
    }
  }
  await browser.close();
  await srv.close();
  console.log(`\n${pass}/${cases.length} e2e cases passed${failures.length ? `, ${failures.length} failed` : ''}`);
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
