/** Browser-only canvas helpers shared by the image tools. */
import { assertFileSize, LimitError } from './safe';

export const MAX_INPUT_PIXELS = 100_000_000;
export const MAX_OUTPUT_PIXELS = 64_000_000;

export type OutFormat = 'png' | 'jpeg' | 'webp';
export const MIME: Record<OutFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
export const EXT: Record<OutFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

export async function decodeImage(file: File): Promise<ImageBitmap> {
  assertFileSize(file);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`"${file.name}" could not be decoded as an image. It may be corrupt, an unsupported format, or not an image at all.`);
  }
  if (bmp.width * bmp.height > MAX_INPUT_PIXELS) {
    const msg = `The image is ${bmp.width}×${bmp.height} (${Math.round((bmp.width * bmp.height) / 1e6)} megapixels). The limit is ${MAX_INPUT_PIXELS / 1e6} megapixels.`;
    bmp.close();
    throw new LimitError(msg);
  }
  return bmp;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const W = Math.round(w), H = Math.round(h);
  if (!(W >= 1 && H >= 1)) throw new Error('Width and height must be at least 1 pixel.');
  if (W * H > MAX_OUTPUT_PIXELS || W > 32767 || H > 32767) throw new LimitError(`The result would be ${W}×${H} pixels. Browsers cannot reliably create canvases larger than ${MAX_OUTPUT_PIXELS / 1e6} megapixels.`);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

export function ctx2d(c: HTMLCanvasElement, opts: { willReadFrequently?: boolean } = {}): CanvasRenderingContext2D {
  const g = c.getContext('2d', { willReadFrequently: opts.willReadFrequently ?? false }) as CanvasRenderingContext2D | null;
  if (!g) throw new Error('This browser could not create a 2D canvas.');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return g;
}

export function resizeBitmap(bmp: ImageBitmap | HTMLCanvasElement, w: number, h: number, bg?: string): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, fmt: OutFormat, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => {
      if (!b) { reject(new Error('The browser could not encode the image.')); return; }
      if (b.type !== MIME[fmt]) { reject(new Error(`This browser cannot encode ${fmt.toUpperCase()} (it produced ${b.type || 'nothing'}). Choose PNG or JPEG.`)); return; }
      resolve(b);
    }, MIME[fmt], quality);
  });
}

/** True when the image has any non-opaque pixel (so flattening it for JPEG changes something). */
export function hasTransparency(c: HTMLCanvasElement): boolean {
  const g = ctx2d(c, { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if ((d[i] as number) < 255) return true;
  return false;
}

export function parseHexColor(s: string, fallback = '#ffffff'): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(s.trim());
  if (!m) return fallback;
  const h = m[1] as string;
  return '#' + (h.length === 3 ? Array.from(h, (c) => c + c).join('') : h).toLowerCase();
}
