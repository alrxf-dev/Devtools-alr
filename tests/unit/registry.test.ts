import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, TOOLS, TOOL_BY_ID, STATUS_LABEL, toolsInCategory, countByStatus } from '../../src/registry';
import { searchTools, normalize } from '../../src/registry/search';

test('catalogue has 151 tools in 10 categories (15 each, Video has 16)', () => {
  assert.equal(TOOLS.length, 151);
  assert.equal(CATEGORIES.length, 10);
  for (const c of CATEGORIES) assert.equal(toolsInCategory(c.id).length, c.id === 'video' ? 16 : 15, c.id);
});

test('tool ids are unique, stable-looking kebab-case, and names are unique', () => {
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
  assert.equal(new Set(TOOLS.map((t) => t.name.toLowerCase())).size, TOOLS.length, 'duplicate tool names suggest renamed copies');
  for (const t of TOOLS) assert.match(t.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, t.id);
  assert.equal(TOOL_BY_ID.size, TOOLS.length);
});

test('every entry is complete, and non-working entries explain themselves', () => {
  for (const t of TOOLS) {
    assert.ok(t.name.length >= 3 && t.description.length >= 30, `${t.id}: thin text`);
    assert.ok(t.description.endsWith('.'), `${t.id}: description should be a sentence`);
    assert.ok(STATUS_LABEL[t.status], t.id);
    if (t.status !== 'working') assert.ok((t.statusNote ?? '').length > 20, `${t.id}: ${t.status} needs an explanation`);
  }
  // No two tools may share a description (guards against "renamed copy" padding).
  assert.equal(new Set(TOOLS.map((t) => t.description)).size, TOOLS.length);
});

test('status counts add up', () => {
  const c = countByStatus();
  assert.equal(c.working + c.partial + c.backend + c.unsupported, TOOLS.length);
});

test('search: ranking, AND semantics, diacritics and punctuation', () => {
  assert.equal(searchTools('')[0]?.id, TOOLS[0]?.id);
  assert.equal(searchTools('').length, TOOLS.length);
  assert.equal(searchTools('pdf merger')[0]?.id, 'pdf-merger');
  assert.equal(searchTools('SHA-256')[0]?.id, 'sha-256-hash-calculator');
  assert.ok(searchTools('sha256').some((t) => t.id === 'sha-256-hash-calculator'));
  assert.equal(searchTools('zzzzqqqq').length, 0);
  assert.ok(searchTools('jwt').some((t) => t.id === 'jwt-decoder'));
  assert.ok(searchTools('exif').length >= 2);
  assert.deepEqual(searchTools('image resize').map((t) => t.id).slice(0, 1), ['image-resizer']);
  assert.equal(normalize('  Café—PDF!! '), 'cafe pdf');
  // AND: both words must match somewhere
  assert.equal(searchTools('pdf banana').length, 0);
});

test('search filters by category and status', () => {
  assert.equal(searchTools('', { category: 'audio' }).length, 15);
  assert.ok(searchTools('', { category: 'audio' }).every((t) => t.category === 'audio'));
  assert.equal(searchTools('', { status: 'partial' }).length, countByStatus().partial);
  assert.equal(searchTools('json', { category: 'security' }).length, 0);
  assert.ok(searchTools('json', { category: 'developer' }).length >= 1);
});

// ---- status honesty guards ----
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCategory } from '../../src/features/index';

test('every tool in the catalogue has an implementation', async () => {
  const { TOOLS: all } = await import('../../src/registry/index');
  const cats = [...new Set(all.map((t) => t.category))];
  const missing: string[] = [];
  for (const c of cats) { const m = await loadCategory(c); for (const t of all.filter((x) => x.category === c)) if (!m[t.id]) missing.push(t.id); }
  assert.deepEqual(missing, []);
});

test('every tool has at least one end-to-end case (so "working" is backed by a test)', async () => {
  const { TOOLS: all } = await import('../../src/registry/index');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e', 'cases');
  const src = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const untested = all.filter((t) => !new RegExp(`id: '${t.id}'`).test(src)).map((t) => t.id);
  assert.deepEqual(untested, []);
});
