# Installation

Requirements: Node 20+, and for e2e tests Chromium via Playwright.

```
npm install
npm run build        # outputs dist/
npm run preview      # serves dist/ locally
npm run dev          # dev server
npm run check        # typecheck + lint + unit + build + e2e
```

`dist/` is a static site: host it on any static server. Serve it with the CSP header from `scripts/csp.mjs` (the build also inlines it as a meta tag).

## Honest notes about this build
- **No lockfile.** The npm registry was unreachable when this project was assembled, so `package-lock.json` could not be generated. Run `npm install` once and commit the lockfile it creates.
- **Offline typecheck.** `npm run typecheck:offline` uses `tools/offline-types/react.d.ts`, a small hand-written React type shim, because `@types/react` was not available. `npm run typecheck` (real `@types/react`) was never run here.
- Dependencies were taken from a pre-populated tool directory, not freshly installed.
- Lint is `scripts/lint.mjs`, a project-specific checker, not ESLint.

## Deploying on Vercel
The repo root has no `index.html`; the site is built into `dist/`. Add a `vercel.json` (or set the same values in Project Settings):
```json
{ "framework": null, "installCommand": "npm install", "buildCommand": "npm run build", "outputDirectory": "dist" }
```
Not verified on Vercel from this environment. `dist/_headers` is Netlify format and is ignored by Vercel.
