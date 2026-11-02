/** Browser-only helpers that use DOMParser (an inert document: scripts never run, nothing is fetched). */

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'FORM', 'DL', 'DT', 'DD']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK']);

export function htmlToText(html: string, opts: { links?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let out = '';
  const nl = () => { if (!out.endsWith('\n\n')) out += out.endsWith('\n') ? '\n' : '\n\n'; };
  const walk = (n: Node, listIdx: { n: number; ordered: boolean } | null, depth: number): void => {
    if (n.nodeType === 3) {
      const t = (n.nodeValue ?? '').replace(/\s+/gu, ' ');
      out += out === '' || out.endsWith('\n') || out.endsWith(' ') ? t.replace(/^ /u, '') : t;
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (SKIP.has(el.tagName)) return;
    if (el.tagName === 'BR') { out += '\n'; return; }
    if (el.tagName === 'PRE') { nl(); out += el.textContent ?? ''; nl(); return; }
    if (el.tagName === 'LI') {
      if (!out.endsWith('\n')) out += '\n';
      const marker = listIdx ? (listIdx.ordered ? `${++listIdx.n}. ` : '• ') : '• ';
      out += '  '.repeat(Math.max(0, depth - 1)) + marker;
      el.childNodes.forEach((c) => walk(c, listIdx, depth));
      out += '\n';
      return;
    }
    const isList = el.tagName === 'UL' || el.tagName === 'OL';
    const block = BLOCK.has(el.tagName);
    if (block && !isList) nl();
    const childList = isList ? { n: 0, ordered: el.tagName === 'OL' } : listIdx;
    el.childNodes.forEach((c) => walk(c, childList, isList ? depth + 1 : depth));
    if (el.tagName === 'A' && opts.links) {
      const h = el.getAttribute('href');
      if (h && /^(https?:|mailto:)/iu.test(h.trim())) out += ` (${h.trim()})`;
    }
    if (el.tagName === 'TD' || el.tagName === 'TH') out += '\t';
    if (block) nl();
  };
  walk(doc.body, null, 0);
  return out.replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
}
