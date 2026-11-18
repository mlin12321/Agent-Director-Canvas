import { describe, expect, it } from "vitest";
import {
  AVAILABLE_COLOR_THEMES,
  COLOR_THEMES,
  DEFAULT_COLOR_THEME,
} from "#/themes/color-themes";
import { contrast, surfaceColor } from "./theme-color-resolver";

const WHITE = surfaceColor("director", "--oh-color-base");

describe("Director palette", () => {
  it("is what a reader without a chosen palette gets", () => {
    expect(DEFAULT_COLOR_THEME).toBe("director");
    expect(COLOR_THEMES.director.appearance).toBe("light");
  });

  it.each(["--oh-background", "--oh-overlay"] as const)(
    "paints %s white",
    (surface) => {
      expect(COLOR_THEMES.director.tokens?.[surface]).toBe("#FFFFFF");
    },
  );

  it("paints a panel in a gray that stands apart from the page and keeps its text readable", () => {
    const panel = surfaceColor("director", "--oh-surface");
    expect(contrast(panel, WHITE)).toBeGreaterThanOrEqual(1.08);
    expect(
      contrast(surfaceColor("director", "--oh-foreground"), panel),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrast(surfaceColor("director", "--oh-link"), panel),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--oh-color-tertiary", "--oh-surface-raised"] as const)(
    "marks %s within a panel with a darker gray",
    (area) => {
      expect(
        contrast(
          surfaceColor("director", area),
          surfaceColor("director", "--oh-surface"),
        ),
      ).toBeGreaterThanOrEqual(1.08);
    },
  );

  it.each([
    "--oh-foreground",
    "--oh-contrast",
    "--oh-surface-foreground",
  ] as const)("prints %s in black", (ink) => {
    expect(COLOR_THEMES.director.tokens?.[ink]).toBe("#000000");
  });

  it("fills primary actions and chosen controls in bright red with a readable label", () => {
    const red = surfaceColor("director", "--oh-color-primary");
    expect(surfaceColor("director", "--oh-accent")).toEqual(red);
    expect(
      contrast(surfaceColor("director", "--oh-accent-foreground"), red),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--oh-border", "--oh-border-input", "--oh-border-subtle"] as const)(
    "draws %s in gray, lighter than the text ink",
    (outline) => {
      expect(contrast(surfaceColor("director", outline), WHITE)).toBeLessThan(
        4,
      );
    },
  );

  it("draws joining lines in a red that stands out from the page", () => {
    const line = surfaceColor("director", "--oh-line-accent");
    expect(line).not.toEqual(surfaceColor("director", "--oh-border"));
    expect(contrast(line, WHITE)).toBeGreaterThanOrEqual(3);
  });

  it.each(
    AVAILABLE_COLOR_THEMES.filter(({ key }) => key !== "director").map(
      ({ key }) => key,
    ),
  )("leaves the joining lines of %s on its border colour", (theme) => {
    expect(surfaceColor(theme, "--oh-line-accent")).toEqual(
      surfaceColor(theme, "--oh-border"),
    );
  });
});
