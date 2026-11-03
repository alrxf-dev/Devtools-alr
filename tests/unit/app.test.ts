import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, href, routeTitle } from '../../src/app/router';
import { createStores, readFxPref, writeFxPref } from '../../src/app/stores';
import { memoryStorage, type KV } from '../../src/app/storage';
import { TOOLS } from '../../src/registry';

test('router parses every kind of route and never throws', () => {
  assert.deepEqual(parseHash(''), { name: 'home' });
  assert.deepEqual(parseHash('#/'), { name: 'home' });
  assert.deepEqual(parseHash('#/tools'), { name: 'tools' });
  assert.deepEqual(parseHash('#/tools?category=pdf&status=partial'), { name: 'tools', category: 'pdf', status: 'partial' });
  assert.deepEqual(parseHash('#/tools?category=bogus&status=nope'), { name: 'tools' });
  assert.deepEqual(parseHash('#/category/audio'), { name: 'category', id: 'audio' });
  assert.equal(parseHash('#/category/nope').name, 'notfound');
  assert.deepEqual(parseHash('#/tool/json-formatter'), { name: 'tool', id: 'json-formatter' });
  assert.equal(parseHash('#/tool/does-not-exist').name, 'notfound');
  assert.deepEqual(parseHash('#/search?q=pdf%20merge'), { name: 'search', q: 'pdf merge' });
  assert.deepEqual(parseHash('#/search'), { name: 'search', q: '' });
  for (const p of ['favorites', 'recent', 'about', 'privacy', 'security', 'help']) assert.equal(parseHash('#/' + p).name, p);
  for (const bad of ['#/%E0%A4%A', '#/a/b/c/d', '#/favorites/x', '#/tool', '#//', '#/__proto__', '#/constructor']) {
    assert.doesNotThrow(() => parseHash(bad));
  }
  assert.equal(parseHash('#/%E0%A4%A').name, 'notfound');
  assert.equal(parseHash('#/__proto__').name, 'notfound');
  assert.equal(parseHash('#/search?q=' + 'x'.repeat(1000)).name, 'search');
  assert.equal((parseHash('#/search?q=' + 'x'.repeat(1000)) as { q: string }).q.length, 200);
});

test('every tool and category links round-trip through the router', () => {
  for (const t of TOOLS) assert.deepEqual(parseHash(href.tool(t.id)), { name: 'tool', id: t.id });
  assert.deepEqual(parseHash(href.search('a&b=c ü')), { name: 'search', q: 'a&b=c ü' });
  assert.deepEqual(parseHash(href.tools({ category: 'image', status: 'working' })), { name: 'tools', category: 'image', status: 'working' });
  assert.equal(routeTitle({ name: 'tool', id: 'json-formatter' }), 'JSON Formatter');
  assert.equal(routeTitle({ name: 'notfound', path: '/x' }), 'Page not found');
});

test('favorites: toggle, persist, ignore unknown ids and corrupt storage', () => {
  const kv = memoryStorage();
  const s = createStores(kv);
  assert.equal(s.toggleFavorite('json-formatter'), true);
  assert.equal(s.toggleFavorite('pdf-merger'), true);
  assert.deepEqual([...s.favorites.get()], ['pdf-merger', 'json-formatter']);
  assert.equal(s.toggleFavorite('json-formatter'), false);
  assert.equal(s.toggleFavorite('not-a-tool'), false);
  assert.deepEqual([...createStores(kv).favorites.get()], ['pdf-merger']); // persisted
  kv.setItem('alrect.favorites.v1', '{"oops":1}');
  assert.deepEqual([...createStores(kv).favorites.get()], []);
  kv.setItem('alrect.favorites.v1', 'not json');
  assert.deepEqual([...createStores(kv).favorites.get()], []);
  kv.setItem('alrect.favorites.v1', JSON.stringify(['json-formatter', 42, 'ghost', '<script>']));
  assert.deepEqual([...createStores(kv).favorites.get()], ['json-formatter']);
  s.clearFavorites();
  assert.equal(s.favorites.get().length, 0);
});

test('recents record real use, dedupe, cap at 12, and can be cleared', () => {
  const s = createStores(memoryStorage());
  assert.equal(s.recents.get().length, 0, 'nothing is recorded until a tool is used');
  s.markUsed('json-formatter', 1000);
  s.markUsed('pdf-merger', 2000);
  s.markUsed('json-formatter', 3000);
  assert.deepEqual(s.recents.get().map((r) => r.id), ['json-formatter', 'pdf-merger']);
  s.markUsed('json-formatter', 3500); // within 60s of itself: no rewrite
  assert.equal(s.recents.get()[0]?.at, 3000);
  s.markUsed('ghost-tool', 4000);
  assert.equal(s.recents.get().length, 2);
  for (const t of TOOLS.slice(0, 20)) s.markUsed(t.id, 10_000 + TOOLS.indexOf(t));
  assert.equal(s.recents.get().length, 12);
  s.clearRecents();
  assert.equal(s.recents.get().length, 0);
});

test('store notifies subscribers and survives a storage that throws', () => {
  const broken: KV = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  const s = createStores(broken);
  let n = 0;
  const off = s.favorites.subscribe(() => n++);
  assert.equal(s.toggleFavorite('json-formatter'), true);
  assert.equal(n, 1);
  assert.deepEqual([...s.favorites.get()], ['json-formatter']); // still works in memory
  off();
  s.toggleFavorite('pdf-merger');
  assert.equal(n, 1);
  assert.equal(readFxPref(broken), 'auto');
  assert.doesNotThrow(() => writeFxPref('off', broken));
  const kv = memoryStorage();
  writeFxPref('off', kv);
  assert.equal(readFxPref(kv), 'off');
});

test('donate route parses, has a title and a hash link', () => {
  assert.equal(parseHash('#/donate').name, 'donate');
  assert.equal(parseHash('#/donate/x').name, 'notfound');
  assert.equal(routeTitle({ name: 'donate' }), 'Donate');
  assert.equal(href.page('donate'), '#/donate');
});
