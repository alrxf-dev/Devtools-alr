/** Median-cut colour quantisation on RGBA pixel data. Pure, so it is unit-tested without a browser. */
export interface PaletteColor { hex: string; r: number; g: number; b: number; share: number }

const hex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();

export function extractPalette(rgba: Uint8ClampedArray | Uint8Array, count: number, opts: { alphaCutoff?: number } = {}): PaletteColor[] {
  const cutoff = opts.alphaCutoff ?? 128;
  // Histogram on 5 bits per channel keeps the work bounded; each bucket remembers the exact mean of its pixels.
  interface Bin { r: number; g: number; b: number; n: number }
  const bins = new Map<number, Bin>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] as number) < cutoff) continue;
    const r = rgba[i] as number, g = rgba[i + 1] as number, b = rgba[i + 2] as number;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bin = bins.get(key);
    if (bin) { bin.r += r; bin.g += g; bin.b += b; bin.n++; }
    else bins.set(key, { r, g, b, n: 1 });
    total++;
  }
  if (total === 0) return [];
  const n = Math.max(1, Math.min(32, Math.floor(count)));
  const chan = (x: Bin, c: number) => (c === 0 ? x.r : c === 1 ? x.g : x.b) / x.n;
  let boxes: Bin[][] = [[...bins.values()]];
  while (boxes.length < n) {
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const x of box) { const v = chan(x, c); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > best) { best = hi - lo; bi = i; ch = c; }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi] as Bin[];
    box.sort((a, b) => chan(a, ch) - chan(b, ch));
    const half = box.reduce((s, x) => s + x.n, 0) / 2;
    let acc = 0, cut = 1;
    for (let k = 0; k < box.length; k++) { acc += (box[k] as Bin).n; if (acc >= half) { cut = k + 1; break; } }
    cut = Math.max(1, Math.min(box.length - 1, cut));
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  const out = boxes.map((box) => {
    let r = 0, g = 0, b = 0, cnt = 0;
    for (const x of box) { r += x.r; g += x.g; b += x.b; cnt += x.n; }
    const rr = Math.round(r / cnt), gg = Math.round(g / cnt), bb = Math.round(b / cnt);
    return { hex: `#${hex2(rr)}${hex2(gg)}${hex2(bb)}`, r: rr, g: gg, b: bb, share: cnt / total };
  });
  return out.sort((a, b) => b.share - a.share);
}

/** Rec. 709 luma of an 8-bit sRGB colour (operating on gamma-encoded values, as image editors usually do). */
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function sepia(r: number, g: number, b: number): [number, number, number] {
  return [Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b), Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b), Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b)];
}

/** Fraction of pixels whose channels differ by more than `threshold` (0-255) between two same-size RGBA buffers. */
export function diffImages(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold = 8): { fraction: number; differing: number; map: Uint8ClampedArray } {
  if (a.length !== b.length) throw new Error('Images must have the same dimensions to be diffed.');
  const map = new Uint8ClampedArray(a.length);
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs((a[i] as number) - (b[i] as number)), Math.abs((a[i + 1] as number) - (b[i + 1] as number)), Math.abs((a[i + 2] as number) - (b[i + 2] as number)), Math.abs((a[i + 3] as number) - (b[i + 3] as number)));
    if (d > threshold) { differing++; map[i] = 255; map[i + 1] = 60; map[i + 2] = 90; map[i + 3] = 255; }
    else { const g = Math.round(luma709(a[i] as number, a[i + 1] as number, a[i + 2] as number) * 0.35); map[i] = g; map[i + 1] = g; map[i + 2] = g; map[i + 3] = 255; }
  }
  return { fraction: differing / (a.length / 4), differing, map };
}
