# Canvas color themes

Canvas has three rendering systems: scoped CSS/HeroUI for the interface, Prism
and Monaco for code, and xterm for terminal output. A palette must cover all of
them; changing the page background alone is not a complete theme.

## Director

Director (`director`) is the default palette: white, then black, then one
bright red, in that order of prominence.

- **White:** the page and every panel (the terminal's too, as xterm paints no
  background of its own). Very light grays mark an area within a panel.
- **Black:** text only. Outlines are gray, as light as the 3:1 boundary rule
  for controls allows.
- **Bright red:** what is filled, chosen or drawn. Primary actions and
  switched-on controls are filled red with a white label; the selected row is
  tinted; icons, the lines that join teams in the org chart
  (`--oh-line-accent`, which every other palette leaves on its border colour)
  and the focus ring are red. Red that is read as text (links, danger) is one
  step deeper so it stays legible on the gray areas.

Icons are coloured by one rule in `tailwind.css`; an icon that carries a
status, warning or success colour, has a `color` attribute, or sits on a
filled control keeps its own. Classes that should apply in this palette only
use the `director:` variant, e.g. `director:bg-primary`. Success and warning
keep the Light+ inks, and code, diffs and terminal output reuse the Light+
palettes unchanged. A reader who already chose a palette keeps it, and an
embedded root that applies none stays on the stylesheet's dark defaults
(`UNAPPLIED_COLOR_THEME`).

## Paper

Paper (`paper`) is an optional light palette printed like an old newspaper:
yellowed newsprint and one warm black ink. Every neutral is a screen of that
ink, primary actions print in reverse (paper on solid ink), and a single spot
red marks links, focus and danger. Status colors are dark olive, ochre and red
inks that stay readable as text; there is no blue in the interface. Code,
diffs and terminal output follow the same inks: reserved words in bold ink,
comments faded, literals in the spot and status inks. Select it in Settings →
Application → Color Theme. It uses the existing `setColorTheme` and browser
preference. Paper stays light
regardless of the operating system's appearance.

Newsreader is used only for `h1`, `h2`, and `.heading`. Dense controls, message
body text, and smaller supporting headings retain their existing fonts; code and
terminal output remain monospaced. The locally bundled roman variable font
uses `font-display: swap`. See [font provenance and licensing](./color-theme/definitions/paper/README.md).
Both app and library builds include the full SIL OFL 1.1 license as
`assets/newsreader-OFL.txt`.

## Adding a palette

1. Add a definition under `color-theme/definitions/`, including its appearance,
   grey scale, HeroUI HSL channels, and semantic token overrides.
2. Add the key to `ColorThemeKey` and register the definition in
   `color-theme/definitions/index.ts`. The settings menu is generated from this
   registry.
3. Select a Prism palette in `syntax-highlighter-themes.ts`, a Monaco palette in
   `file-diff-view.tsx`, and all 16 ANSI colors in `terminal-themes.ts`.
   These mappings are exhaustive so new themes cannot silently inherit a dark
   code or terminal palette.
4. Run the theme tests and inspect settings, portalled menus/modals, chat
   Markdown, inline code, diffs, and ANSI output. Check disabled, selected,
   hover, and keyboard-focus states, then switch back to every dark palette.

## Ownership and component colors

- `setColorTheme` is the selection/persistence entry point. React consumers use
  `useColorTheme`; do not keep another copy of selected-theme state.
- The stylesheet owns theme defaults. `AgentServerUIRoot` owns its React
  attributes and preserves caller `styleOverrides` / `style` inline. The
  runtime must never erase or rewrite those caller-owned properties.
- Runtime CSS includes only palette overrides, not a second copy of base
  defaults. Omitted tokens continue to resolve from the base/host stylesheet.
- Embedded roots use the default appearance until a palette has actually been
  applied; a stored Canvas preference alone must not select an unstyled light
  wrapper. The application owns loading and applying its saved preference.
- The head bootstrap uses the same CSS generator before hydration, including
  when storage is unavailable or contains an obsolete key.
- `--oh-font-heading` controls the display-heading family (`h1`, `h2`, and
  `.heading`). Its default is `inherit`, preserving existing palettes. Paper
  selects the locally bundled Newsreader face with Georgia and serif fallbacks.
  Embedding hosts can override the family through `styleOverrides`.
- Use surface/foreground tokens for ordinary content. `contrast` is the
  high-emphasis ink (white in dark palettes, dark in light palettes); its
  paired `contrast-foreground` is for inverse pills and tooltips. Opacity and
  state variants such as `hover:bg-contrast/10` retain their stated values.
- Use `feedback-error`, `feedback-success`, and `feedback-warning` for small
  validation, connection, and warning messages. These text roles meet 4.5:1 on
  the built-in modal surface and leave the general danger/success/warning control
  colors unchanged. Embedded hosts can override `--oh-feedback-error`,
  `--oh-feedback-success`, and `--oh-feedback-warning` for their surfaces.
- Modal headings and descriptions use `modal-title` and `modal-description`
  (`--oh-modal-title-foreground` / `--oh-modal-description-foreground`). Each
  palette sets a description shade that meets 4.5:1 on the modal surface.
- GitHub Markdown alerts own five `--oh-markdown-alert-*` roles: note, tip,
  important, warning, and caution. Each supplies title/icon ink, the left border,
  and a 5% panel tint. Built-in values keep text readable over Markdown host
  surfaces, including one level of nested alerts; bodies use `contrast` and
  underlined links retain `link`. Embedded hosts can override the five roles
  through `styleOverrides` for their own surfaces.
- Use `focus` for keyboard outlines and rings on neutral controls. The default
  role meets 3:1 against base, modal, raised, and interactive-hover surfaces;
  retain the control's outline width/offset and preserve host `--oh-focus`
  overrides. Check the settled color after a focus transition.
- Literal white is reserved for fixed-color surfaces (for example the blue
  Plan control, an image-lightbox scrim, or a document preview). Do not globally
  redefine white or add theme-specific selectors that reinterpret utilities.
- SVG recoloring must preserve transparent negative-space paths.

CSS custom properties cannot be passed as colors to Monaco or xterm. Those
renderers require concrete colors; xterm's main foreground is resolved from
the mounted scope so embedding overrides still work.
