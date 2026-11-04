import { parseHexColor } from './canvas';

export type FontKey = 'sans' | 'serif' | 'mono' | 'pixel';
export const FONT_STACK: Record<FontKey, string> = {
  sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, Menlo, Consolas, monospace',
  pixel: '"Alrect Pixel", "Courier New", monospace',
};

interface ItemBase {
  enabled: boolean;
  /** Centre of the item as a fraction of the frame (0..1). */
  x: number;
  y: number;
  /** Degrees, -180..180. */
  rotation: number;
  /** 0..1 */
  opacity: number;
}
export interface TextItem extends ItemBase {
  text: string;
  font: FontKey;
  /** Percent of frame height. */
  size: number;
  bold: boolean;
  color: string;
  outline: boolean;
  outlineColor: string;
}
export interface LogoItem extends ItemBase {
  /** Percent of frame width. */
  size: number;
  tint: boolean;
  tintColor: string;
}
export interface WatermarkSpec {
  text: TextItem;
  logo: LogoItem;
  tile: boolean;
  /** Gap between tiles as a fraction of the item size. */
  tileGap: number;
}

export const MAX_TILES = 400;
export const MAX_TEXT = 200;

export const DEFAULT_SPEC: WatermarkSpec = {
  text: { enabled: true, text: '© Your name', x: 0.85, y: 0.92, rotation: 0, opacity: 0.85, font: 'sans', size: 5, bold: true, color: '#ffffff', outline: true, outlineColor: '#000000' },
  logo: { enabled: true, x: 0.12, y: 0.12, rotation: 0, opacity: 0.9, size: 14, tint: false, tintColor: '#ffffff' },
  tile: false,
  tileGap: 1,
};

export const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

/** Anchor grid: col/row 0..2 -> centre fraction that keeps an item of the given size inside the frame with a margin. */
export function anchorCentre(col: 0 | 1 | 2, row: 0 | 1 | 2, frameW: number, frameH: number, itemW: number, itemH: number, marginFrac = 0.03): { x: number; y: number } {
  const mx = marginFrac * Math.min(frameW, frameH);
  const fx = col === 0 ? (mx + itemW / 2) / frameW : col === 1 ? 0.5 : 1 - (mx + itemW / 2) / frameW;
  const fy = row === 0 ? (mx + itemH / 2) / frameH : row === 1 ? 0.5 : 1 - (mx + itemH / 2) / frameH;
  return { x: clamp(fx, 0, 1), y: clamp(fy, 0, 1) };
}

/** Staggered grid of centres covering the frame. Origin (fractions) sets the phase. Capped at MAX_TILES. */
export function tileCentres(frameW: number, frameH: number, itemW: number, itemH: number, gapFrac: number, originX: number, originY: number): { x: number; y: number }[] {
  const stepX = Math.max(4, itemW * (1 + Math.max(0, gapFrac)));
  const stepY = Math.max(4, itemH * (1 + Math.max(0, gapFrac)));
  const ox = originX * frameW, oy = originY * frameH;
  const startY = oy - Math.ceil(oy / stepY) * stepY;
  const out: { x: number; y: number }[] = [];
  for (let y = startY; y < frameH + stepY; y += stepY) {
    // Odd rows (counted from the item's own row) are shifted half a step, so the item itself is always one of the tiles.
    const odd = Math.abs(Math.round((y - oy) / stepY)) % 2 === 1;
    const base = ox + (odd ? stepX / 2 : 0);
    for (let x = base - Math.ceil(base / stepX) * stepX; x < frameW + stepX; x += stepX) {
      out.push({ x, y });
      if (out.length >= MAX_TILES) return out;
    }
  }
  return out;
}

type Source = CanvasImageSource & { width: number; height: number };

function withItem(g: CanvasRenderingContext2D, cx: number, cy: number, rotation: number, opacity: number, paint: () => void): void {
  g.save();
  g.globalAlpha = clamp(opacity, 0, 1);
  g.translate(cx, cy);
  g.rotate((clamp(rotation, -180, 180) * Math.PI) / 180);
  paint();
  g.restore();
}

export interface Measured { w: number; h: number }

/** Size in pixels of each enabled item for a frame, so callers can hit-test and place anchors. */
export function measureItems(g: CanvasRenderingContext2D, frameW: number, frameH: number, spec: WatermarkSpec, logo: Source | null): { text: Measured | null; logo: Measured | null } {
  let text: Measured | null = null, lg: Measured | null = null;
  const t = spec.text;
  if (t.enabled && t.text.trim()) {
    const px = Math.max(4, (frameH * clamp(t.size, 1, 40)) / 100);
    g.save();
    g.font = `${t.bold ? '700' : '400'} ${px}px ${FONT_STACK[t.font]}`;
    const lines = t.text.slice(0, MAX_TEXT).split('\n');
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    g.restore();
    text = { w, h: px * 1.2 * lines.length };
  }
  if (spec.logo.enabled && logo && logo.width > 0) {
    const w = (frameW * clamp(spec.logo.size, 1, 90)) / 100;
    lg = { w, h: (w * logo.height) / logo.width };
  }
  return { text, logo: lg };
}

let tintScratch: HTMLCanvasElement | null = null;
function tinted(logo: Source, w: number, h: number, color: string): CanvasImageSource {
  const c = (tintScratch ??= document.createElement('canvas'));
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(logo, 0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = parseHexColor(color, '#ffffff');
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Draw the watermark onto a frame that is already on the canvas. */
export function drawWatermark(g: CanvasRenderingContext2D, frameW: number, frameH: number, spec: WatermarkSpec, logo: Source | null): void {
  const m = measureItems(g, frameW, frameH, spec, logo);
  const places = (it: { x: number; y: number }, box: Measured): { x: number; y: number }[] =>
    spec.tile ? tileCentres(frameW, frameH, box.w, box.h, spec.tileGap, it.x, it.y) : [{ x: it.x * frameW, y: it.y * frameH }];

  if (m.logo && logo) {
    const box = m.logo, lg = spec.logo;
    const src: CanvasImageSource = lg.tint ? tinted(logo, box.w, box.h, lg.tintColor) : logo;
    for (const p of places(lg, box)) withItem(g, p.x, p.y, lg.rotation, lg.opacity, () => g.drawImage(src, -box.w / 2, -box.h / 2, box.w, box.h));
  }
  if (m.text) {
    const box = m.text, t = spec.text;
    const px = box.h / (1.2 * t.text.slice(0, MAX_TEXT).split('\n').length);
    const lines = t.text.slice(0, MAX_TEXT).split('\n');
    const color = parseHexColor(t.color, '#ffffff'), edge = parseHexColor(t.outlineColor, '#000000');
    for (const p of places(t, box)) {
      withItem(g, p.x, p.y, t.rotation, t.opacity, () => {
        g.font = `${t.bold ? '700' : '400'} ${px}px ${FONT_STACK[t.font]}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineJoin = 'round'; g.lineWidth = Math.max(1, px / 7); g.strokeStyle = edge; g.fillStyle = color;
        lines.forEach((line, i) => {
          const y = (i - (lines.length - 1) / 2) * px * 1.2;
          if (t.outline) g.strokeText(line, 0, y);
          g.fillText(line, 0, y);
        });
      });
    }
  }
}

/** Which item is under a point (frame pixels)? Logo wins over text when they overlap. Rotation is ignored. */
export function hitItem(px: number, py: number, frameW: number, frameH: number, spec: WatermarkSpec, m: { text: Measured | null; logo: Measured | null }): 'text' | 'logo' | null {
  const inside = (it: { x: number; y: number }, box: Measured | null) => !!box && Math.abs(px - it.x * frameW) <= box.w / 2 + 6 && Math.abs(py - it.y * frameH) <= box.h / 2 + 6;
  if (inside(spec.logo, m.logo)) return 'logo';
  if (inside(spec.text, m.text)) return 'text';
  return null;
}
