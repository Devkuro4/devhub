# Dev Hub design notes

A minimal, calm workspace for people learning to build. Light by default (follows the visitor's system), dark available.

## Colour
| Role | Light | Dark |
|---|---|---|
| Page | `#FAFAFA` | `#0A0A0A` |
| Surface | `#FFFFFF` | `#0F0F0F` |
| Ink | `#0A0A0A` | `#FAFAFA` |
| Blue (the only accent) | `#2563EB` | `#3B82F6` |

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

## App shell (matches the reference dashboard)
- A pale backdrop (`--page-bg`) with one floating, rounded white frame (`.app-frame`).
- Left: slim sidebar. Uppercase section labels, active item is blue text only, Settings / Dark mode / Sign out at the bottom.
- Centre: search bar, black banner with blue sparkles, three stat cards, course carousel, activity table.
- Right: profile ring, recent quiz scores, mentors and peers. Only on the home screen; inner screens use a breadcrumb bar.
- Home-screen cards use `.soft-card` (no outline, soft shadow). Everywhere else keeps `.studio-card`.

## Applied site-wide
- `.studio-card` is now the soft card (no outline, soft shadow; hairline outline in dark mode), so every screen picks it up.
- Every primary and outlined button is a pill (rule in `index.css`). Default border colour is a hairline, not black.
- Landing, sign-in and the setup screen use the same round logo, black banner and blue sparkles (`Sparkle`, `LogoMark` in `ui.tsx`).
- Stat tiles in Admin and Progress are soft cards. Left-edge accent bars (feedback, quotes) stay because they carry meaning.
