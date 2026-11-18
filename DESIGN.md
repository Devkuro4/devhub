# Dev Hub design notes

A minimal, calm workspace for people learning to build. Light by default (follows the visitor's system), dark available.

## Colour
| Role | Light | Dark |
|---|---|---|
| Page | `#F6F6F7` | `#000000` |
| Surface | `#FFFFFF` | `#050505` |
| Ink | `#0A0A0A` | `#FAFAFA` |
| Blue (the only accent, the only glow) | `#1F5BFF` | `#2F6BFF` |

Black, white and one blue. Blue marks what you can act on and what is progress: primary buttons, links, the active nav item, progress bars. Everything else stays neutral.

## Type
- One family, Instrument Sans, for headings and body. Code: JetBrains Mono.
- Body is 16px with a 1.65 line height. Nothing in the app is smaller than 13px.
- The scale lives in `src/index.css` under `@theme` (`--text-xs` to `--text-5xl`). Change it there and every `text-xs`, `text-sm` and so on follows.
- Keep paragraphs under about 72 characters wide.

## Where things live
- Tokens, buttons, fields and focus styles: `src/index.css`.
- Shared pieces (page header, tabs, badges, progress, empty states, sign-in): `src/components/ui.tsx`.
- Button, card and input class strings used across screens: "SHARED UI DESIGN TOKENS" in `src/App.tsx`.
- Public landing page for signed-out visitors: `src/components/Landing.tsx`.

## Rules we follow
- One primary action per area. Primary buttons are solid blue; secondary buttons are outlined.
- Cards are for things you act on. Lists, dividers and spacing group everything else.
- Status is never colour alone: badges carry an icon or a word.
- Motion is only used when the person does something, plus one moment on the landing page where the path draws itself. It is switched off for people who ask for reduced motion.
- Every interactive element has a visible keyboard focus ring and a target of at least 44px on touch screens.
