import type { Case } from '../harness';

export const textCases: Case[] = [
  { id: 'word-counter', text: 'The quick brown fox. The dog sleeps!', expect: [/Words\s*7/, /Unique words\s*6/, /Sentences\s*2/, /the\s*2/] },
  { id: 'word-counter', name: 'empty input shows nothing, no crash', text: '   ', noResult: true },
  { id: 'character-counter', text: 'Héllo 👋🏽', expect: [/Characters \(user-perceived\)\s*7/, /UTF-8 bytes\s*15/] },
  { id: 'line-counter', text: 'a\n\nlonger line\nb', expect: [/Lines\s*4/, /Blank lines\s*1/, /Longest line\s*11 characters \(line 3\)/] },
  { id: 'whitespace-cleaner', text: '  a   b  \n\n\n\nc​d ', expect: [/a b\n\nCD|a b\n\ncd/i] },
  { id: 'text-case-converter', text: 'hello wORLD', opts: { 'Convert to': 'camelCase' }, expect: ['helloWorld'] },
  { id: 'text-case-converter', name: 'snake_case', text: 'Hello World Again', opts: { 'Convert to': 'snake_case' }, expect: ['hello_world_again'] },
  { id: 'text-diff-checker', text: 'a\nb\nc', text2: 'a\nB\nc\nd', expect: [/1 line\(s\) added|2 line\(s\) added/, /\- b/, /\+ B/] },
  { id: 'text-diff-checker', name: 'identical', text: 'x\ny', text2: 'x\ny', expect: ['identical'] },
  {
    id: 'markdown-previewer',
    name: 'XSS payloads are neutralised',
    text: '# Title\n\n<script>window.__pwn=1</script>\n<img src=x onerror="window.__pwn=2">\n[bad](javascript:window.__pwn=3)\n<iframe src="https://evil.invalid"></iframe>\n<svg onload="window.__pwn=4"></svg>\n![remote](https://evil.invalid/x.png)',
    expect: ['Title'],
    custom: async (page) => {
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const box = document.querySelector('.rendered');
        return { pwn: (window as unknown as { __pwn?: number }).__pwn ?? null, html: box?.innerHTML ?? '', scripts: box?.querySelectorAll('script,iframe,svg,[onerror],[onload]').length ?? -1, jsLinks: Array.from(box?.querySelectorAll('a') ?? []).filter((a) => /^javascript:/i.test(a.getAttribute('href') ?? '')).length, remoteImg: Array.from(box?.querySelectorAll('img') ?? []).filter((i) => /^https?:/i.test(i.getAttribute('src') ?? '')).length };
      });
      if (r.pwn !== null) throw new Error('XSS payload executed: ' + r.pwn);
      if (r.scripts !== 0) throw new Error('dangerous elements survived: ' + r.html);
      if (r.jsLinks !== 0) throw new Error('javascript: link survived');
      if (r.remoteImg !== 0) throw new Error('remote image survived');
    },
  },
  { id: 'markdown-to-html-converter', text: '# Hi\n\n*em* <script>x()</script>', expect: ['<h1', '<em>em</em>'], expectNot: ['<script'] },
  { id: 'html-to-plain-text-converter', text: '<h1>T</h1><p>a <b>b</b> <a href="https://e.com">l</a></p><ul><li>x</li><li>y</li></ul><script>bad()</script>', expect: [/T\n+a b l \(https:\/\/e\.com\)/, '• x', '• y'], expectNot: ['bad()'] },
  { id: 'csv-viewer', text: 'a,b\n1,2\n"x,y",3', expect: [/Rows\s*2/, /Columns\s*2/, 'x,y'] },
  { id: 'csv-formatter', text: 'a,b\n1,"two, 2"\n3,4,5', expect: ['a,b,', '"two, 2"'] },
  { id: 'csv-formatter', name: 'formula guard option', text: 'a\n=SUM(1)', opts: { 'Neutralise cells that start with = + - @ (spreadsheet formula injection)': true }, expect: ["'=SUM(1)"] },
  { id: 'json-formatter', text: '{"b":1,"a":[1,2]}', opts: { 'Sort keys alphabetically': true }, expect: [/"a": \[\s*1,\s*2\s*\],\s*"b": 1/, 'Valid JSON'] },
  { id: 'json-formatter', name: 'invalid JSON shows location', text: '{"a":1,}', error: /line|position|column/i },
  { id: 'json-formatter', name: 'minify', text: '{ "a": 1,\n "b": [1, 2] }', opts: { Mode: 'Minify' }, expect: ['{"a":1,"b":[1,2]}'] },
  { id: 'xml-formatter', text: '<r><a>1</a><b/></r>', expect: [/<r>\n\s+<a>1<\/a>/] },
  { id: 'xml-formatter', name: 'DTD entity rejected', text: '<!DOCTYPE x [<!ENTITY a "b">]><x>&a;</x>', error: /DTD|entity|ENTITY/i },
  { id: 'xml-formatter', name: 'malformed', text: '<a><b></a>', error: /.+/ },
  {
    id: 'text-editor',
    customOnly: true,
    custom: async (page) => {
      await page.locator('textarea[aria-label="Text editor"]').fill('one two\nthree two');
      await page.getByLabel('Find', { exact: true }).fill('two');
      await page.getByLabel('Replace with').fill('2');
      await page.getByRole('button', { name: 'Replace all' }).click();
      const v = await page.locator('textarea[aria-label="Text editor"]').inputValue();
      if (v !== 'one 2\nthree 2') throw new Error('replace gave ' + JSON.stringify(v));
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Save as/ }).click()]);
      const chunks: Buffer[] = [];
      for await (const c of await dl.createReadStream()) chunks.push(Buffer.from(c as Buffer));
      if (Buffer.concat(chunks).toString() !== 'one 2\nthree 2') throw new Error('saved file differs');
      await page.getByLabel('Open a text file').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('loaded\nfile') });
      await page.waitForFunction(() => (document.querySelector('textarea[aria-label="Text editor"]') as HTMLTextAreaElement).value === 'loaded\nfile');
    },
  },
  {
    id: 'json-viewer',
    customOnly: true,
    custom: async (page) => {
      await page.getByLabel('JSON', { exact: true }).fill('{"a":[1,{"b":null}],"s":"<img src=x onerror=window.__pwn=1>"}');
      await page.waitForSelector('[aria-label="JSON tree"]');
      const t = await page.locator('[aria-label="JSON tree"]').innerText();
      if (!/Array\(2\)/.test(t) || !t.includes('<img src=x')) throw new Error('tree missing content: ' + t);
      if (await page.locator('[aria-label="JSON tree"] img').count()) throw new Error('markup was interpreted as HTML');
      await page.getByLabel('JSON', { exact: true }).fill('{bad');
      await page.waitForSelector('.notice-error');
    },
  },
];
