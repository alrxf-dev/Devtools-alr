# ALRECT FILE TOOLS

Small Pixels. Powerful Tools.

150 file and developer tools in 10 categories (15 each): Image, PDF, Files, Archive, Text, Data, Audio, Video, Developer, Security. Everything runs in your browser; files are not uploaded.

Donate tab (Saweria link, voluntary, unlocks nothing). Day/night switch in the header (first visit follows the clock, then your choice is remembered).

Created by Alrect and AI · mycontant.gokil@alzvyn.web.id

Contact: alrectofficial@gmail.com · GitHub alrxf-dev · Instagram @alrectdev8 · TikTok @xploitalip · WhatsApp +62 821-9240-1340 (the +62 prefix is assumed from the number as given)

## Status (observed when this version was packaged)
| Check | Result |
|---|---|
| Tools implemented | 150 / 150 |
| Tool status | 144 working, 6 partial, 0 backend, 0 unsupported (see [docs/TOOL-STATUS.md](docs/TOOL-STATUS.md)) |
| Typecheck (offline shim) | clean |
| Lint (`scripts/lint.mjs`) | 0 findings |
| Unit tests | 99 / 99 |
| E2E (Playwright, headless Chromium) | 338 / 338 (331 tool cases + 7 page-level UI checks) |
| Production build | OK, `dist/` about 3.2 MB |

## Known limitations
- Partial tools: PDF compressor, PDF document validator, JavaScript formatter, JavaScript minifier, video frame-rate inspector, video trim tool. Reasons are in the tool pages and the status list.
- Video trim: recording output was not verified in headless Chromium, so it is marked partial.
- Night theme was checked on the home, tool list and one tool page, not every tool page. A one-off e2e flake (JWT decoder) was traced to a harness race and fixed by retrying reads; it passed in the final full run.
- Only headless Chromium was tested. Firefox and Safari were not.
- No lockfile and no real `@types/react` check (registry blocked at build time). See INSTALLATION.md.
- Lint is a project-specific checker, not ESLint. `npm audit` was not run.
- Encrypted PDFs and ZIPs are not supported. JWT decode is not verification.

## Docs
INSTALLATION · SECURITY · PRIVACY · CONTRIBUTING · CHANGELOG · THIRD_PARTY_LICENSES · LICENSE (MIT)
