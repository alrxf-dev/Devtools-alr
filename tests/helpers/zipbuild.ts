import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../../src/lib/hash';

const u8 = (...n: number[]) => Uint8Array.from(n);

export interface RawEntry {
  name: string;
  data?: Uint8Array;
  method?: 0 | 8;
  flags?: number;
  declaredUncompressed?: number;
  declaredCompressed?: number;
  externalAttrs?: number;
  madeBy?: number;
  crc?: number;
}

export function buildZip(entries: RawEntry[], opts: { truncate?: number; comment?: string } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let offset = 0;
  const w16 = (v: number) => u8(v & 0xff, (v >> 8) & 0xff);
  const w32 = (v: number) => u8(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const cat = (...a: Uint8Array[]) => {
    const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for (const x of a) {
      out.set(x, o);
      o += x.length;
    }
    return out;
  };
  for (const e of entries) {
    const raw = e.data ?? new Uint8Array(0);
    const method = e.method ?? 0;
    const stored = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = new TextEncoder().encode(e.name);
    const crc = e.crc ?? crc32(raw);
    const usize = e.declaredUncompressed ?? raw.length;
    const csize = e.declaredCompressed ?? stored.length;
    const flags = (e.flags ?? 0) | 0x800;
    const local = cat(w32(0x04034b50), w16(20), w16(flags), w16(method), w16(0), w16(0x21), w32(crc), w32(csize), w32(usize), w16(name.length), w16(0), name, stored);
    cd.push(cat(w32(0x02014b50), w16(e.madeBy ?? 20), w16(20), w16(flags), w16(method), w16(0), w16(0x21), w32(crc), w32(csize), w32(usize), w16(name.length), w16(0), w16(0), w16(0), w16(0), w32(e.externalAttrs ?? 0), w32(offset), name));
    parts.push(local);
    offset += local.length;
  }
  const cdBytes = cat(...cd);
  const comment = new TextEncoder().encode(opts.comment ?? '');
  const eocd = cat(w32(0x06054b50), w16(0), w16(0), w16(entries.length), w16(entries.length), w32(cdBytes.length), w32(offset), w16(comment.length), comment);
  const all = cat(...parts, cdBytes, eocd);
  return opts.truncate ? all.subarray(0, opts.truncate) : all;
}

