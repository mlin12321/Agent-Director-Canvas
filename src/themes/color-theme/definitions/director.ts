import type { AgentServerUICssVariableName } from "#/styles/agent-server-ui-style-scope";
import type { ColorThemeDefinition } from "../types";
// Director inherits Light+ token values, overriding only what differs.
import { LIGHT_PLUS_HEROUI, LIGHT_PLUS_TOKENS } from "./light-plus";

const INK = "#000000";
const PAGE = "#FFFFFF";
// Drawn, never read: lines, rings and dots.
const BRIGHT_RED = "#E60012";
// Read as text, so it stays legible on the gray areas too.
const TEXT_RED = "#C00010";

const DIRECTOR_SCALE = {
  "--cool-grey-50": INK,
  "--cool-grey-100": "#0A0A0A",
  "--cool-grey-200": "#333333",
  "--cool-grey-300": "#474747",
  "--cool-grey-400": "#595959",
  "--cool-grey-500": "#666666",
  "--cool-grey-600": "#8A8A8A",
  "--cool-grey-700": "#D6D6D6",
  "--cool-grey-800": "#E8E8E8",
  "--cool-grey-900": "#F0F0F0",
  "--cool-grey-925": "#F7F7F7",
  "--cool-grey-950": PAGE,
  "--cool-grey-975": "#FAFAFA",
};

const DIRECTOR_TOKENS: Partial<Record<AgentServerUICssVariableName, string>> = {
  ...LIGHT_PLUS_TOKENS,
  // White first: the page and every panel, the terminal's included.
  "--oh-color-base": PAGE,
  "--oh-background": PAGE,
  "--oh-surface": PAGE,
  "--oh-overlay": PAGE,
  "--oh-bg-workspace": PAGE,
  // Light gray marks an area within a panel. The grays stay close to the
  // page so that outlines can be soft and still stand apart from them.
  "--oh-color-base-secondary": "#F7F7F7",
  "--oh-surface-raised": "#F7F7F7",
  "--oh-surface-deep": "#F7F7F7",
  "--oh-color-tertiary": "#F2F2F2",
  "--oh-interactive-hover": "#E0E0E0",
  "--oh-interactive-hover-low": "#EBEBEB",
  "--oh-interactive-active": "#E6E6E6",
  "--oh-segment": "#F7F7F7",
  "--oh-bg-light": "#F7F7F7",
  "--oh-bg-editor-sidebar": "#F7F7F7",
  "--oh-bg-editor-active": "#F2F2F2",
  "--oh-default": "#EBEBEB",
  // Outlines are gray, never ink: black is for text alone.
  "--oh-border": "#D6D6D6",
  "--oh-border-subtle": "#E3E3E3",
  "--oh-border-input": "#898989",
  "--oh-border-editor-sidebar": "#D6D6D6",
  "--oh-separator": "rgba(0, 0, 0, 0.12)",
  // Black second: text.
  "--oh-foreground": INK,
  "--oh-contrast": INK,
  "--oh-surface-foreground": INK,
  "--oh-overlay-foreground": INK,
  "--oh-modal-title-foreground": INK,
  "--oh-color-content": INK,
  "--oh-color-content-2": INK,
  "--oh-default-foreground": INK,
  "--oh-segment-foreground": INK,
  "--oh-context-window-foreground": INK,
  "--oh-text-editor-active": INK,
  // Notices that are neither good nor bad news stay in ink, not blue.
  "--oh-info": INK,
  "--oh-scrollbar": "rgba(0, 0, 0, 0.24)",
  "--oh-scrollbar-hover": "rgba(0, 0, 0, 0.4)",
  // Red last, and wherever something is filled, chosen or drawn: primary
  // actions, what is switched on or selected, icons, lines, focus.
  "--oh-color-primary": BRIGHT_RED,
  "--oh-accent": BRIGHT_RED,
  "--oh-accent-foreground": PAGE,
  "--oh-interactive-selected": "#FEEFF0",
  "--oh-line-accent": BRIGHT_RED,
  "--oh-focus": BRIGHT_RED,
  "--oh-color-logo": BRIGHT_RED,
  "--oh-status-error": BRIGHT_RED,
  "--oh-link": TEXT_RED,
  "--oh-color-danger": TEXT_RED,
  "--oh-danger": TEXT_RED,
  "--oh-feedback-error": TEXT_RED,
};

export const director: ColorThemeDefinition = {
  label: "Director",
  appearance: "light",
  scale: DIRECTOR_SCALE,
  heroui: LIGHT_PLUS_HEROUI,
  tokens: DIRECTOR_TOKENS,
};
