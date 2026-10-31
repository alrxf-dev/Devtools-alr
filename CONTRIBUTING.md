# Contributing

1. `npm install`, then `npm run check` (typecheck, lint, unit tests, build, e2e).
2. A tool is added in three places: metadata in `src/registry/catalog/<category>.ts`, implementation in `src/features/<category>.ts`, and at least one e2e case in `tests/e2e/cases/`. Unit tests fail if any of the three is missing.
3. Status must be honest: use `partial` plus a `statusNote` for any known limit. Do not mark `working` without a passing e2e case.
4. No purple, no marketing filler in UI text, no network calls, no analytics.
5. Add a line to CHANGELOG.md.
