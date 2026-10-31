/** Hashing: SHA via Web Crypto, MD5 and CRC32 implemented locally (Web Crypto has no MD5). */

export type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'CRC32';

export const LEGACY_NOTICE: Partial<Record<HashAlgo, string>> = {
  MD5: 'MD5 is broken for collision resistance. Use it only for non-adversarial checksums, never to authenticate files or passwords.',
  'SHA-1': 'SHA-1 has practical collision attacks. Use SHA-256 or stronger when integrity must resist an attacker.',
  CRC32: 'CRC32 detects accidental corruption only. It offers no protection against deliberate tampering.',
};

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i++) s += (u[i] as number).toString(16).padStart(2, '0');
  return s;
}

export async function hashBytes(algo: HashAlgo, data: Uint8Array): Promise<string> {
  if (algo === 'MD5') return md5(data);
  if (algo === 'CRC32') return crc32(data).toString(16).padStart(8, '0');
  const digest = await crypto.subtle.digest(algo, data as BufferSource);
  return toHex(digest);
}

export async function hashText(algo: HashAlgo, text: string): Promise<string> {
  return hashBytes(algo, new TextEncoder().encode(text));
}

/** Incrementally hash a Blob/File in chunks so large files do not need to fit in a single buffer for MD5/CRC. */
export async function hashFile(algo: HashAlgo, file: Blob, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<string> {
  if (algo === 'MD5' || algo === 'CRC32') {
    const CHUNK = 4 * 1024 * 1024;
    const h = algo === 'MD5' ? new Md5Stream() : new Crc32Stream();
    for (let off = 0; off < file.size; off += CHUNK) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      h.update(new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer()));
      onProgress?.(Math.min(1, (off + CHUNK) / Math.max(1, file.size)));
    }
    return h.digest();
  }
  // Web Crypto has no streaming API; whole-file buffer is required for SHA.
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  const buf = new Uint8Array(await file.arrayBuffer());
  onProgress?.(0.9);
  const out = await hashBytes(algo, buf);
  onProgress?.(1);
  return out;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return r === 0;
}

/** Guess which algorithm a pasted digest belongs to, from its length. */
export function guessAlgoFromHex(hex: string): HashAlgo[] {
  const h = hex.trim();
  if (!/^[0-9a-fA-F]+$/u.test(h)) return [];
  switch (h.length) {
    case 8: return ['CRC32'];
    case 32: return ['MD5'];
    case 40: return ['SHA-1'];
    case 64: return ['SHA-256'];
    case 96: return ['SHA-384'];
    case 128: return ['SHA-512'];
    default: return [];
  }
}

// ---------- CRC32 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return ~c >>> 0;
}

class Crc32Stream {
  private v = 0;
  update(d: Uint8Array): void {
    this.v = crc32(d, this.v);
  }
  digest(): string {
    return this.v.toString(16).padStart(8, '0');
  }
}

// ---------- MD5 (RFC 1321) ----------

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

class Md5Stream {
  private a = 0x67452301;
  private b = 0xefcdab89;
  private c = 0x98badcfe;
  private d = 0x10325476;
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private total = 0;

  update(data: Uint8Array): void {
    this.total += data.length;
    let off = 0;
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      off = take;
      if (this.bufLen === 64) {
        this.block(this.buf, 0);
        this.bufLen = 0;
      }
    }
    while (off + 64 <= data.length) {
      this.block(data, off);
      off += 64;
    }
    if (off < data.length) {
      this.buf.set(data.subarray(off), 0);
      this.bufLen = data.length - off;
    }
  }

  private block(d: Uint8Array, o: number): void {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = ((d[o + i * 4] as number) | ((d[o + i * 4 + 1] as number) << 8) | ((d[o + i * 4 + 2] as number) << 16) | ((d[o + i * 4 + 3] as number) << 24)) >>> 0;
    }
    let A = this.a;
    let B = this.b;
    let C = this.c;
    let D = this.d;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + (K[i] as number) + (M[g] as number)) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = S[i] as number;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    this.a = (this.a + A) >>> 0;
    this.b = (this.b + B) >>> 0;
    this.c = (this.c + C) >>> 0;
    this.d = (this.d + D) >>> 0;
  }

  digest(): string {
    const bits = this.total * 8;
    const padLen = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    const lo = bits >>> 0;
    const hi = Math.floor(bits / 2 ** 32) >>> 0;
    for (let i = 0; i < 4; i++) {
      pad[padLen + i] = (lo >>> (8 * i)) & 0xff;
      pad[padLen + 4 + i] = (hi >>> (8 * i)) & 0xff;
    }
    const savedTotal = this.total;
    this.update(pad);
    this.total = savedTotal;
    const out = new Uint8Array(16);
    [this.a, this.b, this.c, this.d].forEach((v, i) => {
      for (let k = 0; k < 4; k++) out[i * 4 + k] = (v >>> (8 * k)) & 0xff;
    });
    return toHex(out);
  }
}

export function md5(data: Uint8Array): string {
  const h = new Md5Stream();
  h.update(data);
  return h.digest();
}
