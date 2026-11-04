# Changelog

## 0.1.4
- New tool: Video Watermark (video category, now 16 tools; catalogue total 151). Text and/or logo (PNG, JPG, WebP, GIF, SVG), any colour, logo recolour, font, size, opacity, rotation, drag-to-place, arrow-key nudging, quick positions, tiling, output width and bitrate, optional audio. Renders a WebM copy by playing the video once in real time.
- NEW badge on tool cards and tool pages, and a "New" filter on the tools page (`#/tools?new=1`).
- Search placeholder and labels now use the real tool count.
- Tests: watermark maths unit tests, 6 e2e cases for the tool (including pixel checks on the downloaded video), 1 UI check for the NEW label.
- Fix: on screens under 560px the remove button in file lists stretched to full width and hid the file name (all tools).
- Video Trim Tool unchanged and still partial: re-recording in headless Chromium still produced no data in several attempts.

## 0.1.3
- Credits (About page): doodle-notebook icon bar plus a text list with email, GitHub, Instagram, TikTok and WhatsApp.

## 0.1.2
- Donate tab and page with a wave button linking to saweria.co/alzhenjb (new tab, `noopener noreferrer`). Donations are voluntary and unlock nothing; feature requests are not promised.
- Donate link in the footer; privacy page mentions the external link.

## 0.1.1
- Day/night switch in the header. Day is the original cream-window skin; night is a 2.5D theme (slate windows, stacked extruded edges, teal rim light, card tilt on hover).
- First visit picks the theme from the local clock (06:00-17:59 day); the choice is then saved in localStorage (`alrect.theme`).
- Privacy text now lists the theme choice instead of the removed effects toggle.
- New tests: theme unit test and five page-level e2e checks (clock default, click + persistence, keyboard, 390px layout, reduced motion).

## 0.1.0
- 150 tools in 10 categories, all client-side.
- Neo-retro pixel interface (navy, turquoise, orange, cream), chiptune sound effects after first interaction, WebGL pixel background with CSS fallback.
- Unit, typecheck, lint, production build and Playwright e2e scripts.
