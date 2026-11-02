import type { Page, Download } from 'playwright';

export interface FileIn { name: string; buffer: Buffer | Uint8Array | string; mimeType?: string }

export interface DownloadCheck {
  /** Text of the button to click */
  button: string | RegExp;
  /** Expected suggested filename */
  filename?: string | RegExp;
  /** Receives the downloaded bytes; return true when the content is right, or a string describing the problem. */
  check: (data: Buffer, name: string) => boolean | string | Promise<boolean | string>;
}

export interface Case {
  /** Tool id this case exercises. */
  id: string;
  /** Short description of the scenario, shown on failure. */
  name?: string;
  text?: string;
  text2?: string;
  files?: FileIn[];
  /** label → value. Strings choose select options (by label) or fill inputs; booleans toggle checkboxes. */
  opts?: Record<string, string | number | boolean>;
  /** Substrings or regexes that must appear in the visible result. */
  expect?: (string | RegExp)[];
  /** Must NOT appear in the visible result. */
  expectNot?: (string | RegExp)[];
  /** Expect a visible error notice that matches. */
  error?: string | RegExp;
  downloads?: DownloadCheck[];
  /** Escape hatch for custom-UI tools or extra assertions. Throw to fail. */
  custom?: (page: Page, h: Helpers) => Promise<void>;
  /** Skip the generic run; the case drives everything through `custom`. */
  customOnly?: boolean;
  /** The tool is expected to show neither a result nor an error (e.g. empty input in a live tool). */
  noResult?: boolean;
  /** The tool legitimately shows an error-toned notice inside a normal result (e.g. a failed verification). */
  errorNoticeOk?: boolean;
}

export interface Helpers {
  resultText(): Promise<string>;
  expectText(re: string | RegExp, scope?: string): Promise<void>;
}

const norm = (s: string) => s.replace(/ /g, ' ');

export async function setField(page: Page, label: string, value: string | number | boolean): Promise<void> {
  const loc = page.getByLabel(label, { exact: true });
  const tag = await loc.first().evaluate((e) => (e as HTMLElement).tagName + ':' + ((e as HTMLInputElement).type ?? ''));
  if (tag.startsWith('SELECT')) await loc.first().selectOption({ label: String(value) });
  else if (tag.endsWith('checkbox')) await loc.first().setChecked(Boolean(value));
  else await loc.first().fill(String(value));
}

export async function runCase(page: Page, base: string, c: Case): Promise<string[]> {
  const problems: string[] = [];
  await page.goto(`${base}#/tool/${c.id}`);
  await page.waitForSelector('.tool-panel', { timeout: 15000 });
  // The category chunk loads lazily, so wait until the tool's real controls exist before interacting.
  await page.waitForSelector('.tool-panel button, .tool-panel textarea, .tool-panel input, .tool-panel select', { timeout: 15000 });
  const helpers: Helpers = {
    resultText: async () => norm(await page.locator(((await page.locator('.tool-result').count()) ? '.tool-result' : '.tool-panel')).first().innerText()),
    async expectText(re, scope = '.tool-panel') {
      const t = norm(await page.locator(scope).first().innerText());
      const ok = typeof re === 'string' ? t.includes(re) : re.test(t);
      if (!ok) throw new Error(`missing ${String(re)} in result:\n${t.slice(0, 600)}`);
    },
  };
  try {
    if (!c.customOnly) {
      const tas = page.locator('.tool-panel textarea');
      if (c.text !== undefined) await tas.nth(0).fill(c.text);
      if (c.text2 !== undefined) await tas.nth(1).fill(c.text2);
      if (c.files?.length) {
        await page.locator('.tool-panel input[type=file]').first().setInputFiles(c.files.map((f) => ({ name: f.name, mimeType: f.mimeType ?? 'application/octet-stream', buffer: Buffer.from(f.buffer as never) })));
      }
      for (const [label, v] of Object.entries(c.opts ?? {})) await setField(page, label, v);
      const run = page.locator('.tool-panel button[type=submit]');
      if (await run.count()) {
        await run.click();
      }
      if (c.noResult) {
        await page.waitForTimeout(800);
        if ((await page.locator('.tool-panel .result').count()) + (await page.locator('.tool-panel .notice-error').count()) > 0) problems.push('expected no result and no error');
        return problems;
      }
      // wait until busy ends and either a result or an error is visible
      await page.waitForFunction(() => {
        const p = document.querySelector('.tool-panel');
        if (!p) return false;
        const busy = Array.from(p.querySelectorAll('button[type=submit]')).some((b) => (b.textContent ?? '').includes('Working'));
        return !busy && (p.querySelector('.result') !== null || p.querySelector('.notice-error') !== null);
      }, undefined, { timeout: 60000 });
    }
    const txt = await helpers.resultText();
    if (c.error !== undefined) {
      const err = norm(await page.locator('.tool-panel .notice-error').first().innerText().catch(() => ''));
      const ok = typeof c.error === 'string' ? err.includes(c.error) : c.error.test(err);
      if (!ok) problems.push(`expected error ${String(c.error)} but got: ${err || '(no error shown)'}`);
    } else if (!c.customOnly && !c.errorNoticeOk) {
      const err = await page.locator('.tool-panel .notice-error').count();
      if (err > 0) problems.push(`unexpected error: ${norm(await page.locator('.tool-panel .notice-error').first().innerText())}`);
    }
    // Auto-run tools may still show the previous result when the first read happens, so retry for a short while.
    let seen = txt;
    const missing = () => (c.expect ?? []).filter((e) => !(typeof e === 'string' ? seen.includes(e) : e.test(seen)));
    for (let i = 0; i < 12 && missing().length > 0; i++) { await page.waitForTimeout(250); seen = await helpers.resultText(); }
    for (const e of missing()) problems.push(`missing ${String(e)}`);
    for (const e of c.expectNot ?? []) {
      const bad = typeof e === 'string' ? txt.includes(e) : e.test(txt);
      if (bad) problems.push(`should not contain ${String(e)}`);
    }
    for (const d of c.downloads ?? []) {
      const [dl]: [Download, unknown] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.locator('.tool-panel').getByRole('button', { name: d.button }).first().click(),
      ]);
      const name = dl.suggestedFilename();
      const stream = await dl.createReadStream();
      const chunks: Buffer[] = [];
      for await (const ch of stream) chunks.push(Buffer.from(ch as Buffer));
      const buf = Buffer.concat(chunks);
      if (d.filename !== undefined) {
        const ok = typeof d.filename === 'string' ? name === d.filename : d.filename.test(name);
        if (!ok) problems.push(`download name ${name} did not match ${String(d.filename)}`);
      }
      const r = await d.check(buf, name);
      if (r !== true) problems.push(`download check failed${typeof r === 'string' ? ': ' + r : ''}`);
    }
    if (c.custom) await c.custom(page, helpers);
  } catch (e) {
    if (process.env.E2E_DEBUG) console.log("DEBUG html:", (await page.locator("main").first().innerHTML().catch(() => "?")).replace(/<svg.*?<\/svg>/gs, "").slice(0, 1800));
    problems.push((e as Error).message);
  }
  return problems;
}
