import type { Browser } from 'playwright';

export interface UiCheck { name: string; problems: string[] }

/** Page-level checks that are not tied to one tool: theme switch, persistence, keyboard, layout, reduced motion. */
export async function runUiChecks(browser: Browser, base: string): Promise<UiCheck[]> {
  const out: UiCheck[] = [];
  const check = async (name: string, fn: () => Promise<string[]>) => {
    try { out.push({ name, problems: await fn() }); } catch (e) { out.push({ name, problems: [`threw: ${(e as Error).message}`] }); }
  };
  const theme = (p: import('playwright').Page) => p.evaluate(() => document.documentElement.dataset.theme);
  const bg = (p: import('playwright').Page) => p.evaluate(() => getComputedStyle(document.querySelector('.card') as Element).backgroundColor);

  await check('theme: first visit follows the clock (06-18 day)', async () => {
    const res: string[] = [];
    for (const [hour, want] of [[9, 'day'], [22, 'night']] as const) {
      const ctx = await browser.newContext({ timezoneId: 'UTC' });
      await ctx.clock.setFixedTime(new Date(Date.UTC(2026, 0, 1, hour, 0, 0)));
      const p = await ctx.newPage(); await p.goto(`${base}#/tools`); await p.waitForSelector('.theme-switch');
      const t = await theme(p); if (t !== want) res.push(`at ${hour}:00 expected ${want}, got ${t}`);
      await ctx.close();
    }
    return res;
  });

  await check('theme: click toggles, colours change, choice survives reload', async () => {
    const ctx = await browser.newContext(); await ctx.addInitScript(() => { if (!localStorage.getItem('alrect.seeded')) { localStorage.setItem('alrect.seeded', '1'); localStorage.setItem('alrect.theme', 'day'); } });
    const p = await ctx.newPage(); await p.goto(`${base}#/tools`); await p.waitForSelector('.card');
    const res: string[] = [];
    const dayBg = await bg(p);
    await p.click('.theme-switch'); await p.waitForTimeout(300);
    if ((await theme(p)) !== 'night') res.push('click did not switch to night');
    if (!(await p.isChecked('.theme-switch__checkbox'))) res.push('checkbox not checked in night');
    const nightBg = await bg(p); if (nightBg === dayBg) res.push(`card colour unchanged (${dayBg})`);
    await p.reload(); await p.waitForSelector('.card');
    if ((await theme(p)) !== 'night') res.push('night not remembered after reload');
    await p.click('.theme-switch'); await p.waitForTimeout(200);
    if ((await theme(p)) !== 'day') res.push('second click did not return to day');
    await ctx.close(); return res;
  });

  await check('theme: keyboard (focus + Space) toggles the switch', async () => {
    const ctx = await browser.newContext(); await ctx.addInitScript(() => { if (!localStorage.getItem('alrect.seeded')) { localStorage.setItem('alrect.seeded', '1'); localStorage.setItem('alrect.theme', 'day'); } });
    const p = await ctx.newPage(); await p.goto(`${base}#/tools`); await p.waitForSelector('.theme-switch');
    await p.focus('.theme-switch__checkbox'); await p.keyboard.press('Space'); await p.waitForTimeout(200);
    const res: string[] = []; if ((await theme(p)) !== 'night') res.push('Space did not toggle');
    if ((await p.getAttribute('.theme-switch__checkbox', 'aria-label')) !== 'Night mode') res.push('missing aria-label');
    await ctx.close(); return res;
  });

  await check('layout: no horizontal scroll at 390px in day and night', async () => {
    const res: string[] = [];
    for (const t of ['day', 'night']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await ctx.addInitScript((v) => localStorage.setItem('alrect.theme', v), t);
      const p = await ctx.newPage();
      for (const route of ['#/', '#/tools', '#/tool/json-to-csv']) {
        await p.goto(base + route); await p.waitForTimeout(500);
        if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)) res.push(`${t} ${route} scrolls horizontally`);
      }
      await ctx.close();
    }
    return res;
  });

  await check('motion: reduced-motion disables the night card tilt', async () => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' }); await ctx.addInitScript(() => localStorage.setItem('alrect.theme', 'night'));
    const p = await ctx.newPage(); await p.goto(`${base}#/tools`); await p.waitForSelector('.card');
    await p.hover('.card'); await p.waitForTimeout(300);
    const tr = await p.evaluate(() => getComputedStyle(document.querySelector('.card') as Element).transform);
    await ctx.close(); return tr === 'none' ? [] : [`card transform under reduced motion: ${tr}`];
  });
  return out;
}
