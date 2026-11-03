# Changelog

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
