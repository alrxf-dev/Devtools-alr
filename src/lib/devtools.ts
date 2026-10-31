/**
 * Developer tools. Nothing here executes user-supplied code: formatters work on tokens, never on eval.
 * Where a tool is a conservative approximation (JS formatting/minifying, HTML formatting) it says so in its own
 * output notes and is labelled "Partial" in the registry.
 */
import { base64ToBytes } from './encoding';

// ---------- CSS ----------

/** Tokenise CSS just enough to respect strings and comments, then re-indent by braces. */
export function formatCss(css: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  let out = '';
  let depth = 0;
  let i = 0;
  const n = css.length;
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    buf = '';
    return t;
  };
  while (i < n) {
    const c = css[i] as string;
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      const t = flush();
      if (t) out += pad.repeat(depth) + t + '\n';
      out += pad.repeat(depth) + css.slice(i, stop) + '\n';
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      buf += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '(') {
      // Keep url(...) and function arguments on one line.
      let d = 1;
      let j = i + 1;
      while (j < n && d > 0) {
        if (css[j] === '(') d++;
        else if (css[j] === ')') d--;
        else if (css[j] === '"' || css[j] === "'") {
          const q = css[j] as string;
          j++;
          while (j < n && css[j] !== q) j += css[j] === '\\' ? 2 : 1;
        }
        j++;
      }
      buf += css.slice(i, j).replace(/\s+/gu, ' ');
      i = j;
      continue;
    }
    if (c === '{') {
      const sel = flush().replace(/\s*,\s*/gu, ',\n' + pad.repeat(depth));
      out += pad.repeat(depth) + sel + ' {\n';
      depth++;
    } else if (c === '}') {
      const t = flush();
      if (t) out += pad.repeat(depth) + t.replace(/\s+/gu, ' ').replace(/\s*:\s*/u, ': ') + (t.endsWith(';') ? '' : ';') + '\n';
      depth = Math.max(0, depth - 1);
      out += pad.repeat(depth) + '}\n' + (depth === 0 ? '\n' : '');
    } else if (c === ';') {
      const t = flush();
      if (t) out += pad.repeat(depth) + t.replace(/\s+/gu, ' ').replace(/\s*:\s*/u, ': ') + ';\n';
    } else buf += c;
    i++;
  }
  const rest = flush();
  if (rest) out += pad.repeat(depth) + rest + '\n';
  if (depth !== 0) throw new Error('Unbalanced braces: the stylesheet has an unclosed "{".');
  return out.replace(/\n{3,}/gu, '\n\n').trim() + '\n';
}

export function minifyCss(css: string): string {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i] as string;
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated comment.');
      // Keep /*! license */ comments.
      if (css[i + 2] === '!') out += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      if (j >= n) throw new Error('Unterminated string.');
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/\s/u.test(c)) {
      while (i < n && /\s/u.test(css[i] as string)) i++;
      const prev = out[out.length - 1] ?? '';
      const next = css[i] ?? '';
      if (!/[{};:,>+~(]/u.test(prev) && !/[{};:,>+~)]/u.test(next) && out !== '' && !out.endsWith('*/')) out += ' ';
      continue;
    }
    if (c === ';') {
      let k = i + 1;
      while (k < n && /\s/u.test(css[k] as string)) k++;
      if (css[k] === '}') {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out.trim();
}

// ---------- JavaScript (conservative) ----------

/**
 * Remove comments and redundant whitespace WITHOUT renaming or reordering anything.
 * Newlines are preserved (collapsed) so automatic semicolon insertion behaviour never changes.
 * This is deliberately not a full minifier; there is no parser, so regex literals are handled heuristically.
 */
export function minifyJsConservative(src: string): string {
  const out: string[] = [];
  let line = '';
  let i = 0;
  const n = src.length;
  let lastSig = '';
  const pushLine = () => {
    const t = line.trim();
    if (t) out.push(t);
    line = '';
  };
  while (i < n) {
    const c = src[i] as string;
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new Error('Unterminated block comment.');
      if (src[i + 2] === '!') line += src.slice(i, end + 2);
      const hadNl = src.slice(i, end).includes('\n');
      i = end + 2;
      if (hadNl) pushLine();
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c !== '`' && src[j] === '\n') throw new Error('Unterminated string literal.');
        j++;
      }
      if (j >= n) throw new Error('Unterminated string literal.');
      const lit = src.slice(i, j + 1);
      if (c === '`') {
        // Template literals may span lines; flush the current line and keep the literal verbatim.
        line += lit;
      } else line += lit;
      lastSig = c;
      i = j + 1;
      continue;
    }
    if (c === '/' && /[(,=:[!&|?{};]|^$/u.test(lastSig) ) {
      // Probably a regex literal.
      let j = i + 1;
      let inClass = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) break;
        j++;
      }
      if (src[j] === '/') {
        j++;
        while (j < n && /[a-z]/iu.test(src[j] as string)) j++;
        line += src.slice(i, j);
        lastSig = ')';
        i = j;
        continue;
      }
    }
    if (c === '\n') {
      pushLine();
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r')) j++;
      const prev = line[line.length - 1] ?? '';
      const next = src[j] ?? '';
      // Only keep a space where removing it would join two identifier characters.
      if (/[\w$]/u.test(prev) && /[\w$]/u.test(next)) line += ' ';
      else if ((prev === '+' && next === '+') || (prev === '-' && next === '-') || (prev === '+' && next === '-') || (prev === '-' && next === '+')) line += ' ';
      i = j;
      continue;
    }
    line += c;
    if (!/\s/u.test(c)) lastSig = c;
    i++;
  }
  pushLine();
  return out.join('\n');
}

/** Indent by braces/brackets, respecting strings, comments and template literals. Not a full pretty-printer. */
export function formatJsBasic(src: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  let out = '';
  let depth = 0;
  let i = 0;
  const n = src.length;
  let atLineStart = true;
  let parenDepth = 0;
  const startLine = () => {
    if (atLineStart) {
      out += pad.repeat(Math.max(0, depth));
      atLineStart = false;
    }
  };
  while (i < n) {
    const c = src[i] as string;
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      startLine();
      out += src.slice(i, j).trimEnd();
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      startLine();
      out += src.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      startLine();
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '(') {
      parenDepth++;
      if (/\b(if|for|while|switch|catch|with)$/u.test(out)) out += ' ';
    }
    if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (c === '{') {
      startLine();
      out += (out.endsWith(' ') || out.endsWith('(') || out.endsWith('\n') || out === '' ? '' : ' ') + '{\n';
      depth++;
      atLineStart = true;
      i++;
      while (/[ \t\r\n]/u.test(src[i] ?? 'x')) i++;
      continue;
    }
    if (c === '}') {
      if (!atLineStart) out += '\n';
      depth = Math.max(0, depth - 1);
      atLineStart = true;
      startLine();
      out += '}';
      i++;
      // Keep "} else", "});", "},", ")" on the same line.
      const tail = src.slice(i, i + 14);
      if (/^\s*(else|catch|finally)\b/u.test(tail)) {
        out += ' ';
      } else if (!/^[ \t]*[);,.]/u.test(tail)) {
        out += '\n';
        atLineStart = true;
      }
      while (src[i] === ' ' || src[i] === '\t' || src[i] === '\r' || (src[i] === '\n' && /^\s*(else|catch|finally)\b/u.test(src.slice(i, i + 14)))) i++;
      if (src[i] === '\n') i++;
      continue;
    }
    if (c === ';' && parenDepth === 0) {
      out += ';\n';
      atLineStart = true;
      i++;
      while (/[ \t\r\n]/u.test(src[i] ?? 'x')) i++;
      continue;
    }
    if (c === '\n') {
      if (!atLineStart) {
        out += '\n';
        atLineStart = true;
      }
      i++;
      while (src[i] === ' ' || src[i] === '\t' || src[i] === '\r') i++;
      continue;
    }
    if ((c === ' ' || c === '\t') && atLineStart) {
      i++;
      continue;
    }
    startLine();
    out += c;
    i++;
  }
  if (depth !== 0) throw new Error('Unbalanced braces: the source has an unclosed "{" or an extra "}".');
  return out.trimEnd() + '\n';
}

// ---------- HTML (token based, no DOM) ----------

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'pre', 'textarea']);

interface HtmlToken {
  kind: 'text' | 'open' | 'close' | 'self' | 'comment' | 'doctype' | 'raw';
  text: string;
  name?: string;
}

function tokenizeHtml(html: string): HtmlToken[] {
  const toks: HtmlToken[] = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html[i] === '<') {
      if (html.startsWith('<!--', i)) {
        const e = html.indexOf('-->', i + 4);
        const stop = e < 0 ? n : e + 3;
        toks.push({ kind: 'comment', text: html.slice(i, stop) });
        i = stop;
        continue;
      }
      if (/^<!doctype/iu.test(html.slice(i, i + 9))) {
        const e = html.indexOf('>', i);
        toks.push({ kind: 'doctype', text: html.slice(i, e < 0 ? n : e + 1) });
        i = e < 0 ? n : e + 1;
        continue;
      }
      const m = /^<(\/?)([A-Za-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/u.exec(html.slice(i, i + 20000));
      if (m) {
        const name = (m[2] as string).toLowerCase();
        const self = (m[3] as string).trimEnd().endsWith('/') || VOID.has(name);
        if (m[1]) toks.push({ kind: 'close', text: m[0], name });
        else if (RAW.has(name) && !self) {
          const closeRe = new RegExp(`</${name}\\s*>`, 'iu');
          const rest = html.slice(i + m[0].length);
          const cm = closeRe.exec(rest);
          const inner = cm ? rest.slice(0, cm.index) : rest;
          const closeTxt = cm ? cm[0] : '';
          toks.push({ kind: 'raw', text: m[0] + inner + closeTxt, name });
          i += m[0].length + inner.length + closeTxt.length;
          continue;
        } else toks.push({ kind: self ? 'self' : 'open', text: m[0], name });
        i += m[0].length;
        continue;
      }
    }
    let j = html.indexOf('<', i + 1);
    if (j < 0) j = n;
    toks.push({ kind: 'text', text: html.slice(i, j) });
    i = j;
  }
  return toks;
}

export function formatHtml(html: string, indent = 2): string {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];
  let depth = 0;
  const stack: string[] = [];
  for (const t of tokenizeHtml(html)) {
    if (t.kind === 'text') {
      const txt = t.text.replace(/\s+/gu, ' ').trim();
      if (txt) lines.push(pad.repeat(depth) + txt);
    } else if (t.kind === 'open') {
      lines.push(pad.repeat(depth) + t.text);
      stack.push(t.name as string);
      depth++;
    } else if (t.kind === 'close') {
      const idx = stack.lastIndexOf(t.name as string);
      if (idx < 0) throw new Error(`Closing tag </${t.name}> has no matching opening tag.`);
      stack.length = idx;
      depth = stack.length;
      lines.push(pad.repeat(depth) + t.text);
    } else lines.push(pad.repeat(depth) + t.text);
  }
  return lines.join('\n') + '\n';
}

const BLOCK_TAGS = new Set(['html', 'head', 'body', 'div', 'p', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'blockquote', 'pre', 'form', 'fieldset', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'hr', 'br', 'title', 'meta', 'link', 'script', 'style', 'template', 'details', 'summary', 'option', 'select', 'textarea', 'video', 'audio', 'canvas']);

/** Whitespace between inline elements is meaningful ("<b>a</b> <i>b</i>"), so it is collapsed to one space, not removed. */
export function minifyHtml(html: string): string {
  const toks: HtmlToken[] = [];
  for (const t of tokenizeHtml(html)) {
    if (t.kind === 'comment' && !/^<!--\[if/iu.test(t.text)) continue;
    const last = toks[toks.length - 1];
    if (t.kind === 'text' && last?.kind === 'text') last.text += t.text; // a removed comment can leave two text runs side by side
    else toks.push({ ...t });
  }
  const isBlockish = (t: HtmlToken | undefined): boolean => t === undefined || t.kind === 'doctype' || t.kind === 'raw' || (t.name !== undefined && BLOCK_TAGS.has(t.name.toLowerCase()));
  const out: string[] = [];
  toks.forEach((t, i) => {
    if (t.kind === 'comment' || t.kind === 'doctype') { out.push(t.text); return; }
    if (t.kind === 'text') {
      let v = t.text.replace(/\s+/gu, ' ');
      if (isBlockish(toks[i - 1])) v = v.replace(/^ /u, '');
      if (isBlockish(toks[i + 1])) v = v.replace(/ $/u, '');
      out.push(v);
    } else if (t.kind === 'raw') {
      out.push(t.name === 'script' || t.name === 'style' ? t.text.replace(/\n\s*/gu, '\n').trim() : t.text);
    } else out.push(t.text.replace(/\s+/gu, ' ').replace(/\s+>/u, '>').replace(/\s+\/>/u, '/>'));
  });
  return out.join('').trim();
}

// ---------- URL ----------

export interface UrlParts {
  href: string;
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  params: [string, string][];
  warnings: string[];
}

export function parseUrl(input: string): UrlParts {
  const raw = input.trim();
  if (raw === '') throw new Error('Enter a URL.');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Not a valid absolute URL. Include a scheme, for example https://example.com/path.');
  }
  const warnings: string[] = [];
  if (u.username || u.password) warnings.push('The URL embeds credentials (user:password@host). Never share or log such URLs.');
  if (!['http:', 'https:'].includes(u.protocol)) warnings.push(`Scheme "${u.protocol}" is not HTTP(S).`);
  if (u.protocol === 'http:') warnings.push('Plain HTTP is not encrypted.');
  if (/xn--/u.test(u.hostname)) warnings.push('Hostname uses Punycode (internationalised domain). Check the decoded form for look-alike characters.');
  return {
    href: u.href, protocol: u.protocol, username: u.username, password: u.password ? '(present — hidden)' : '', host: u.host, hostname: u.hostname, port: u.port,
    pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, params: [...u.searchParams.entries()], warnings,
  };
}

// ---------- JWT ----------

export interface JwtParts {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signaturePresent: boolean;
  signatureBytes: number;
  claims: string[];
  warnings: string[];
}

function decodeSegment(seg: string, label: string): Record<string, unknown> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(seg);
  } catch {
    throw new Error(`The ${label} segment is not valid Base64URL.`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`The ${label} segment is not valid UTF-8.`);
  }
  try {
    const v = JSON.parse(text) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v as Record<string, unknown>;
  } catch {
    throw new Error(`The ${label} segment is not a JSON object.`);
  }
}

/** DECODES only. It never verifies a signature, so the result must not be trusted as authentic. */
export function decodeJwt(token: string, now = Date.now()): JwtParts {
  const t = token.trim().replace(/^Bearer\s+/iu, '');
  const parts = t.split('.');
  if (parts.length !== 3) throw new Error(`A JWT has 3 dot-separated parts; this input has ${parts.length}. (Encrypted JWE tokens have 5 and cannot be decoded here.)`);
  const header = decodeSegment(parts[0] as string, 'header');
  const payload = decodeSegment(parts[1] as string, 'payload');
  const warnings: string[] = ['Decoded only. The signature was NOT verified, so the contents may be forged.'];
  const alg = String(header['alg'] ?? '');
  if (alg.toLowerCase() === 'none') warnings.push('alg is "none": the token is unsigned and must not be accepted as proof of identity.');
  if (!alg) warnings.push('No "alg" in the header.');
  const sec = (k: string): number | null => (typeof payload[k] === 'number' ? (payload[k] as number) : null);
  const exp = sec('exp');
  const nbf = sec('nbf');
  if (exp !== null) warnings.push(exp * 1000 < now ? `Expired at ${new Date(exp * 1000).toISOString()}.` : `Expires at ${new Date(exp * 1000).toISOString()}.`);
  if (nbf !== null && nbf * 1000 > now) warnings.push(`Not valid before ${new Date(nbf * 1000).toISOString()}.`);
  let sigBytes = 0;
  try {
    sigBytes = base64ToBytes(parts[2] as string).length;
  } catch {
    warnings.push('The signature segment is not valid Base64URL.');
  }
  return { header, payload, signaturePresent: (parts[2] as string).length > 0, signatureBytes: sigBytes, claims: Object.keys(payload), warnings };
}

// ---------- Colour ----------

export interface ColorInfo {
  hex: string;
  rgb: string;
  hsl: string;
  r: number;
  g: number;
  b: number;
  a: number;
  luminance: number;
}

export function parseColor(input: string): ColorInfo {
  const s = input.trim().toLowerCase();
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  let m: RegExpExecArray | null;
  if ((m = /^#?([0-9a-f]{3,4})$/u.exec(s))) {
    const h = m[1] as string;
    r = parseInt(h[0] as string + h[0], 16);
    g = parseInt(h[1] as string + h[1], 16);
    b = parseInt(h[2] as string + h[2], 16);
    if (h.length === 4) a = parseInt(h[3] as string + h[3], 16) / 255;
  } else if ((m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/u.exec(s))) {
    const h = m[1] as string;
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (m[2]) a = parseInt(m[2], 16) / 255;
  } else if ((m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/u.exec(s))) {
    r = Number(m[1]);
    g = Number(m[2]);
    b = Number(m[3]);
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (r > 255 || g > 255 || b > 255) throw new Error('RGB channels must be 0–255.');
  } else if ((m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/u.exec(s))) {
    const h = (((Number(m[1]) % 360) + 360) % 360) / 360;
    const sat = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    if (sat > 1 || l > 1) throw new Error('Saturation and lightness must be 0–100%.');
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t: number) => {
      const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      return tt < 1 / 6 ? p + (q - p) * 6 * tt : tt < 1 / 2 ? q : tt < 2 / 3 ? p + (q - p) * (2 / 3 - tt) * 6 : p;
    };
    r = Math.round(hue(h + 1 / 3) * 255);
    g = Math.round(hue(h) * 255);
    b = Math.round(hue(h - 1 / 3) * 255);
  } else {
    throw new Error('Unrecognised colour. Use #RGB, #RRGGBB, #RRGGBBAA, rgb(r, g, b) or hsl(h, s%, l%).');
  }
  if (a < 0 || a > 1 || Number.isNaN(a)) throw new Error('Alpha must be between 0 and 1.');
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase() + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() : '');
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rf ? (gf - bf) / d + (gf < bf ? 6 : 0) : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4;
    h *= 60;
  }
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(rf) + 0.7152 * lin(gf) + 0.0722 * lin(bf);
  const aTxt = a < 1 ? `, ${Number(a.toFixed(3))}` : '';
  return {
    hex, r, g, b, a, luminance,
    rgb: `${a < 1 ? 'rgba' : 'rgb'}(${r}, ${g}, ${b}${aTxt})`,
    hsl: `${a < 1 ? 'hsla' : 'hsl'}(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%${aTxt})`,
  };
}

export function contrastRatio(a: ColorInfo, b: ColorInfo): number {
  const [hi, lo] = a.luminance > b.luminance ? [a, b] : [b, a];
  return (hi.luminance + 0.05) / (lo.luminance + 0.05);
}

// ---------- HTTP headers ----------

export interface HeaderReport {
  headers: { name: string; value: string }[];
  notes: string[];
  duplicates: string[];
}

export function parseHttpHeaders(text: string): HeaderReport {
  const lines = text.split(/\r?\n/u);
  const headers: { name: string; value: string }[] = [];
  const notes: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] as string;
    if (raw.trim() === '') continue;
    if (/^HTTP\/\d/iu.test(raw)) {
      notes.push(`Status line: ${raw.trim()}`);
      continue;
    }
    if (/^[ \t]/u.test(raw) && headers.length) {
      (headers[headers.length - 1] as { value: string }).value += ' ' + raw.trim();
      continue;
    }
    const idx = raw.indexOf(':');
    if (idx <= 0) throw new Error(`Line ${i + 1} is not a valid header (expected "Name: value").`);
    const name = raw.slice(0, idx).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name)) throw new Error(`Line ${i + 1}: "${name}" is not a valid header name.`);
    headers.push({ name, value: raw.slice(idx + 1).trim() });
  }
  if (headers.length === 0) throw new Error('No headers found.');
  const counts = new Map<string, number>();
  for (const h of headers) counts.set(h.name.toLowerCase(), (counts.get(h.name.toLowerCase()) ?? 0) + 1);
  const duplicates = [...counts].filter(([, c]) => c > 1).map(([k]) => k);
  for (const h of headers) {
    const n = h.name.toLowerCase();
    if (n === 'set-cookie') {
      const attrs = h.value.toLowerCase();
      const missing = [!attrs.includes('secure') && 'Secure', !attrs.includes('httponly') && 'HttpOnly', !attrs.includes('samesite') && 'SameSite'].filter(Boolean);
      if (missing.length) notes.push(`Set-Cookie "${h.value.split('=')[0]}" lacks: ${missing.join(', ')}.`);
    }
    if (n === 'server' && /\d/u.test(h.value)) notes.push(`Server header discloses a version ("${h.value}").`);
    if (n === 'x-powered-by') notes.push(`X-Powered-By discloses the stack ("${h.value}"); consider removing it.`);
  }
  return { headers, notes, duplicates };
}

// ---------- line counter ----------

const LANGS: Record<string, { line: string[]; block?: [string, string] }> = {
  js: { line: ['//'], block: ['/*', '*/'] }, ts: { line: ['//'], block: ['/*', '*/'] }, java: { line: ['//'], block: ['/*', '*/'] }, c: { line: ['//'], block: ['/*', '*/'] },
  cpp: { line: ['//'], block: ['/*', '*/'] }, cs: { line: ['//'], block: ['/*', '*/'] }, go: { line: ['//'], block: ['/*', '*/'] }, rs: { line: ['//'], block: ['/*', '*/'] },
  css: { line: [], block: ['/*', '*/'] }, html: { line: [], block: ['<!--', '-->'] }, xml: { line: [], block: ['<!--', '-->'] },
  py: { line: ['#'] }, rb: { line: ['#'] }, sh: { line: ['#'] }, yaml: { line: ['#'] }, php: { line: ['//', '#'], block: ['/*', '*/'] }, sql: { line: ['--'], block: ['/*', '*/'] }, lua: { line: ['--'] },
};

export function languageForExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./u, '');
  const alias: Record<string, string> = { jsx: 'js', mjs: 'js', cjs: 'js', tsx: 'ts', h: 'c', hpp: 'cpp', cc: 'cpp', yml: 'yaml', bash: 'sh', htm: 'html', svg: 'xml', kt: 'java', swift: 'c' };
  const k = alias[e] ?? e;
  return k in LANGS ? k : 'generic';
}

export interface LineCount {
  total: number;
  code: number;
  comment: number;
  blank: number;
}

export function countSourceLines(src: string, lang: string): LineCount {
  const spec = LANGS[lang];
  const res: LineCount = { total: 0, code: 0, comment: 0, blank: 0 };
  let inBlock = false;
  const lines = src === '' ? [] : src.split(/\r\n|\r|\n/u);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // a final newline ends the last line; it does not start another
  for (const raw of lines) {
    res.total++;
    const t = raw.trim();
    if (t === '') {
      res.blank++;
      continue;
    }
    if (!spec) {
      res.code++;
      continue;
    }
    if (inBlock) {
      res.comment++;
      if (spec.block && t.includes(spec.block[1])) {
        inBlock = false;
        const after = t.slice(t.indexOf(spec.block[1]) + spec.block[1].length).trim();
        if (after) {
          res.comment--;
          res.code++;
        }
      }
      continue;
    }
    if (spec.line.some((m) => t.startsWith(m))) {
      res.comment++;
      continue;
    }
    if (spec.block && t.startsWith(spec.block[0])) {
      const end = t.indexOf(spec.block[1], spec.block[0].length);
      if (end < 0) {
        inBlock = true;
        res.comment++;
      } else if (t.slice(end + spec.block[1].length).trim() === '') res.comment++;
      else res.code++;
      continue;
    }
    res.code++;
    if (spec.block) {
      const open = t.lastIndexOf(spec.block[0]);
      if (open >= 0 && t.indexOf(spec.block[1], open) < 0) inBlock = true;
    }
  }
  return res;
}
