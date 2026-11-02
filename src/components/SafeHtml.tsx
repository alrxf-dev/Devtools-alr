import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { safeHref } from '../lib/safe';

let configured = false;
function configure(): void {
  if (configured) return;
  configured = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const raw = node.getAttribute('href');
      const ok = raw !== null ? safeHref(raw) : null;
      if (ok === null) node.removeAttribute('href');
      else {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    }
    if (node.tagName === 'IMG') {
      // Remote images would leak the viewer's IP to a third party, and the CSP blocks them anyway. Keep data: only.
      const src = node.getAttribute('src') ?? '';
      if (!/^data:image\/(png|jpe?g|gif|webp);/i.test(src)) {
        node.removeAttribute('src');
        node.setAttribute('alt', node.getAttribute('alt') || '[remote image blocked]');
      }
    }
  });
}

export function sanitizeHtml(html: string): string {
  configure();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'action', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  });
}

/** The ONLY place in the app that injects HTML, and only after sanitising. */
export function SafeHtml({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
