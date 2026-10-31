/** Security helpers shared by every tool: path/filename sanitising, URL scheme checks, limits. */

export const LIMITS = {
  /** Largest file most tools will read fully into memory. */
  maxFileBytes: 256 * 1024 * 1024,
  /** Largest text input accepted in a textarea-based tool. */
  maxTextChars: 20_000_000,
  /** Archive safety limits (see zip.ts). */
  zip: {
    maxEntries: 5_000,
    maxTotalUncompressedBytes: 512 * 1024 * 1024,
    maxEntryUncompressedBytes: 256 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 1024,
    maxPathDepth: 32,
  },
} as const;

export class LimitError extends Error {
  override name = 'LimitError';
}

export function assertFileSize(file: { name: string; size: number }, max: number = LIMITS.maxFileBytes): void {
  if (file.size > max) throw new LimitError(`"${truncateName(file.name)}" is ${(file.size / 1048576).toFixed(1)} MiB; this tool accepts files up to ${(max / 1048576).toFixed(0)} MiB.`);
}

export function truncateName(name: string, max = 80): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

/**
 * Convert an archive entry name to a safe relative path, or return null if it escapes the destination.
 * Rejects absolute paths, drive letters, UNC paths, NUL bytes, ".." traversal and over-long or over-deep names.
 */
export function safeRelativePath(entryName: string): { path: string | null; reason?: string } {
  if (entryName.includes('\0')) return { path: null, reason: 'contains a NUL byte' };
  if (entryName.length === 0) return { path: null, reason: 'is empty' };
  if (entryName.length > LIMITS.zip.maxPathLength) return { path: null, reason: 'path is too long' };
  const normalized = entryName.replace(/\\/gu, '/');
  if (normalized.startsWith('/')) return { path: null, reason: 'is an absolute path' };
  if (/^[A-Za-z]:/u.test(normalized)) return { path: null, reason: 'has a drive letter' };
  if (normalized.startsWith('//')) return { path: null, reason: 'is a UNC path' };
  // Control characters (including bidi overrides) have no business in extracted names.
  if (/[\u0000-\u001F\u007F‪-‮⁦-⁩]/u.test(normalized)) return { path: null, reason: 'contains control characters' };
  const segs: string[] = [];
  for (const seg of normalized.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return { path: null, reason: 'contains ".." path traversal' };
    segs.push(seg);
  }
  if (segs.length === 0) return { path: null, reason: 'resolves to an empty path' };
  if (segs.length > LIMITS.zip.maxPathDepth) return { path: null, reason: 'is nested too deeply' };
  return { path: segs.join('/') };
}

/** Make a single filename safe to hand to the browser's download dialog. */
export function safeDownloadName(name: string, fallback = 'download'): string {
  const base = (name.split(/[\\/]/u).pop() ?? '')
    .replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩<>:"|?*]/gu, '_')
    .replace(/^\.+/u, '')
    .trim();
  const cut = base.length > 150 ? base.slice(0, 150) : base;
  return cut === '' ? fallback : cut;
}

const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** Returns the URL if its scheme is on the allow-list, otherwise null. Never allows javascript:, data:, vbscript:, file:. */
export function safeHref(raw: string, base = 'https://example.invalid'): string | null {
  try {
    const u = new URL(raw.trim(), base);
    return SAFE_LINK_SCHEMES.has(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Replace the final extension of a filename. */
export function withExtension(name: string, ext: string, suffix = ''): string {
  const base = (name.split(/[\\/]/u).pop() ?? name).replace(/\.[^./\\]*$/u, '');
  return safeDownloadName(`${base}${suffix}.${ext.replace(/^\./u, '')}`);
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'An unexpected error occurred.';
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
