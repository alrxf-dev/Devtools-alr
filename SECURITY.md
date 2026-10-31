# Security

## Threat model
All input is untrusted: file names, CSV, JSON, XML, YAML, SVG, Markdown and file metadata. Everything runs client-side, so the main risks are XSS, resource exhaustion and misleading results.

## What the code does
- HTML only enters the page through `SafeHtml` (DOMPurify allow-list). `scripts/lint.mjs` fails the build if `innerHTML`, `dangerouslySetInnerHTML` or `insertAdjacentHTML` appear elsewhere.
- No `eval` or `new Function` (also lint-enforced).
- CSP from `scripts/csp.mjs`: scripts and styles from `'self'` only.
- ZIP reading limits: 5000 entries, 512 MiB total, compression ratio 200. Entry paths are sanitised.
- Regex tester runs in a worker with a 2 s timeout. Heavy compute runs in a worker.
- XML entity declarations, YAML custom tags and alias bombs are rejected.
- CSV/spreadsheet exports prefix formula-looking cells with `'`.
- Tokens use `crypto.getRandomValues`.

## What it does NOT do
- JWT decoding is not verification.
- MD5 and SHA-1 are labelled legacy and are not for security use.
- It does not remove or bypass PDF passwords; encrypted PDFs are rejected. Encrypted ZIPs are not supported.
- No scan, certification or audit result is claimed. `npm audit` was not run (registry blocked in the build environment).

## Reporting
Email mycontant.gokil@alzvyn.web.id with steps to reproduce.
