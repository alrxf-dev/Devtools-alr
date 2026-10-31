# ALRECT FILE TOOLS

Small Pixels. Powerful Tools.

150 file and developer tools in 10 categories (15 each): Image, PDF, Files, Archive, Text, Data, Audio, Video, Developer, Security. Everything runs in your browser; files are not uploaded.

Created by Alrect and AI · mycontant.gokil@alzvyn.web.id

## Status (observed when this version was packaged)
| Check | Result |
|---|---|
| Tools implemented | 150 / 150 |
| Tool status | 144 working, 6 partial, 0 backend, 0 unsupported (see [docs/TOOL-STATUS.md](docs/TOOL-STATUS.md)) |
| Typecheck (offline shim) | clean |
| Lint (`scripts/lint.mjs`) | 0 findings |
| Unit tests | 97 / 97 |
| E2E (Playwright, headless Chromium) | 331 / 331 |
| Production build | OK, `dist/` about 3.2 MB |

## Known limitations
- Partial tools: PDF compressor, PDF document validator, JavaScript formatter, JavaScript minifier, video frame-rate inspector, video trim tool. Reasons are in the tool pages and the status list.
- Video trim: recording output was not verified in headless Chromium, so it is marked partial.
- Only headless Chromium was tested. Firefox and Safari were not.
- No lockfile and no real `@types/react` check (registry blocked at build time). See INSTALLATION.md.
- Lint is a project-specific checker, not ESLint. `npm audit` was not run.
- Encrypted PDFs and ZIPs are not supported. JWT decode is not verification.

## Docs
INSTALLATION · SECURITY · PRIVACY · CONTRIBUTING · CHANGELOG · THIRD_PARTY_LICENSES · LICENSE (MIT)
