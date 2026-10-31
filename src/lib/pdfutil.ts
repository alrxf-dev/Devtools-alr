/** Small PDF helpers that need no PDF library: page-range parsing and raw-structure scanning. */

/** "1-3, 7, 10-" -> zero-based indices. Order and duplicates are kept when `keepOrder` is set. */
export function parsePageRanges(spec: string, pageCount: number, opts: { keepOrder?: boolean } = {}): number[] {
  const s = spec.trim();
  if (!s) throw new Error('Enter page numbers such as 1-3, 7, 10-12.');
  const out: number[] = [];
  for (const raw of s.split(/[,;\s]+/u).filter(Boolean)) {
    const m = /^(\d+)?(?:-(\d+)?)?$/u.exec(raw);
    if (!m || (m[1] === undefined && m[2] === undefined)) throw new Error(`"${raw}" is not a page or range. Use numbers like 3 or 2-5.`);
    const hasDash = raw.includes('-');
    const a = m[1] === undefined ? 1 : Number(m[1]);
    const b = hasDash ? (m[2] === undefined ? pageCount : Number(m[2])) : a;
    if (a < 1 || b < 1) throw new Error('Pages start at 1.');
    if (a > pageCount || b > pageCount) throw new Error(`Page ${Math.max(a, b)} does not exist. The document has ${pageCount} page${pageCount === 1 ? '' : 's'}.`);
    if (a > b) throw new Error(`Range "${raw}" runs backwards.`);
    for (let p = a; p <= b; p++) out.push(p - 1);
    if (out.length > 100000) throw new Error('That selects too many pages.');
  }
  return opts.keepOrder ? out : [...new Set(out)].sort((x, y) => x - y);
}

export interface PdfStructure {
  header: string | null;
  version: string | null;
  eofMarker: boolean;
  startxref: boolean;
  xrefTable: boolean;
  xrefStream: boolean;
  encrypted: boolean;
  encryptInfo: { filter: string | null; v: number | null; r: number | null; length: number | null } | null;
}

const latin = (b: Uint8Array, from: number, to: number): string => {
  let s = '';
  for (let i = Math.max(0, from); i < Math.min(b.length, to); i++) s += String.fromCharCode(b[i] as number);
  return s;
};

/** Scan the raw bytes: header, trailer keywords, /Encrypt. Pattern matching only; not a parser. */
export function scanPdf(b: Uint8Array): PdfStructure {
  const head = latin(b, 0, 1024), tail = latin(b, b.length - 2048, b.length);
  const h = /%PDF-(\d\.\d)/u.exec(head);
  const eof = tail.lastIndexOf('%%EOF');
  const full = b.length <= 32 * 1024 * 1024 ? latin(b, 0, b.length) : head + tail;
  const enc = /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/u.exec(tail) ?? (/\/Encrypt\s*(\d+\s+\d+\s+R|<<)/u.exec(full));
  let info: PdfStructure['encryptInfo'] = null;
  if (enc) {
    const ctx = full.slice(Math.max(0, (enc.index ?? 0) - 0), (enc.index ?? 0) + 400);
    let dict = '';
    const ref = /\/Encrypt\s*(\d+)\s+\d+\s+R/u.exec(ctx);
    if (ref) { const m = new RegExp(`(?:^|[\\r\\n ])${ref[1]}\\s+0\\s+obj([\\s\\S]{0,600}?)endobj`, 'u').exec(full); dict = m?.[1] ?? ''; } else dict = ctx;
    const num = (k: string) => { const m = new RegExp(`/${k}\\s+(\\d+)`, 'u').exec(dict); return m ? Number(m[1]) : null; };
    info = { filter: /\/Filter\s*\/(\w+)/u.exec(dict)?.[1] ?? null, v: num('V'), r: num('R'), length: num('Length') };
  }
  return {
    header: h ? h[0] : null, version: h?.[1] ?? null, eofMarker: eof >= 0, startxref: /startxref\s+\d+/u.test(tail),
    xrefTable: /\r?\nxref\r?\n/u.test(full) || /^xref/mu.test(tail), xrefStream: /\/Type\s*\/XRef/u.test(full), encrypted: enc !== null, encryptInfo: info,
  };
}

export const PAPER: [string, number, number][] = [['A3', 841.89, 1190.55], ['A4', 595.28, 841.89], ['A5', 419.53, 595.28], ['Letter', 612, 792], ['Legal', 612, 1008], ['Tabloid', 792, 1224], ['B5', 498.9, 708.66]];

export function matchPaper(w: number, h: number, tol = 2): string | null {
  const [a, b] = w <= h ? [w, h] : [h, w];
  for (const [n, pw, ph] of PAPER) if (Math.abs(a - pw) <= tol && Math.abs(b - ph) <= tol) return n;
  return null;
}
