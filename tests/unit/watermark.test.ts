import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorCentre, tileCentres, clamp, hitItem, DEFAULT_SPEC, MAX_TILES } from '../../src/lib/watermark';

test('clamp handles NaN and bounds', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(Number.NaN, 2, 3), 2);
});

test('anchorCentre keeps the item inside the frame with a margin', () => {
  const tl = anchorCentre(0, 0, 1000, 500, 100, 40);
  assert.ok(tl.x * 1000 - 50 >= 14.9 && tl.y * 500 - 20 >= 14.9, JSON.stringify(tl));
  const br = anchorCentre(2, 2, 1000, 500, 100, 40);
  assert.ok(br.x * 1000 + 50 <= 1000 - 14.9 && br.y * 500 + 20 <= 500 - 14.9, JSON.stringify(br));
  assert.deepEqual(anchorCentre(1, 1, 1000, 500, 100, 40), { x: 0.5, y: 0.5 });
});

test('tileCentres covers the frame, is capped, and honours the origin phase', () => {
  const a = tileCentres(1000, 600, 100, 50, 1, 0.5, 0.5);
  assert.ok(a.length > 6 && a.length <= MAX_TILES);
  assert.ok(a.some((p) => Math.abs(p.x - 500) < 0.001 && Math.abs(p.y - 300) < 0.001), 'origin tile present');
  const huge = tileCentres(10000, 10000, 5, 5, 0, 0, 0);
  assert.equal(huge.length, MAX_TILES);
  assert.ok(tileCentres(1000, 600, 0, 0, -3, 0.2, 0.2).length > 0, 'zero size and negative gap do not hang or return nothing');
});

test('hitItem prefers the logo and misses empty space', () => {
  const spec = { ...DEFAULT_SPEC, text: { ...DEFAULT_SPEC.text, x: 0.5, y: 0.5 }, logo: { ...DEFAULT_SPEC.logo, x: 0.5, y: 0.5 } };
  const m = { text: { w: 100, h: 20 }, logo: { w: 80, h: 80 } };
  assert.equal(hitItem(500, 300, 1000, 600, spec, m), 'logo');
  assert.equal(hitItem(540, 300, 1000, 600, spec, { text: m.text, logo: null }), 'text');
  assert.equal(hitItem(10, 10, 1000, 600, spec, m), null);
});
