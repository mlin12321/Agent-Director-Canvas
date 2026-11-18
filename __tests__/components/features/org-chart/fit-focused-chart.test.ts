import { describe, expect, it } from "vitest";
import { fitFocusedChart } from "#/components/features/org-chart/focused-chart";

const team = (reports: number, hasSubTeams = false, hasParent = true) => ({
  reports,
  hasParent,
  hasSubTeams,
});
const ROOMY = { width: 1500, height: 600 };

describe("fitFocusedChart", () => {
  it("zooms a team to the width it has when one row is the largest it gets", () => {
    // Six in a row are 1424 wide.
    const fit = fitFocusedChart(team(6, true), { width: 1780, height: 400 });

    expect(fit.columns).toBe(6);
    expect(fit.scale).toBeCloseTo(1.25);
  });

  it("wraps the reports into rows when that makes the team larger", () => {
    // One row of fifteen would be far too wide; three rows of five are 1184.
    const fit = fitFocusedChart(team(15), { width: 1400, height: 650 });

    expect(fit.columns).toBe(5);
    expect(fit.scale).toBeCloseTo(1400 / 1184);
  });

  it("enlarges a small team by six tenths and no further, in one row", () => {
    const vast = { width: 4000, height: 3000 };

    expect(fitFocusedChart(team(0), vast)).toEqual({ columns: 1, scale: 1.6 });
    expect(fitFocusedChart(team(3), vast)).toEqual({ columns: 3, scale: 1.6 });
  });

  it("does not shrink a team that does not fit at its own size: it scrolls", () => {
    const tight = fitFocusedChart(team(15), { width: 980, height: 300 });

    // As many to a row as fit across at its own size.
    expect(tight).toEqual({ columns: 4, scale: 1 });
  });

  it("does not shrink a team without reports in a space smaller than its card", () => {
    expect(
      fitFocusedChart(team(0, false, false), { width: 80, height: 500 }),
    ).toEqual({ columns: 1, scale: 1 });
  });

  it("keeps a very large team at its own size and lets the chart scroll", () => {
    const fit = fitFocusedChart(team(1000, true), ROOMY);

    expect(fit.scale).toBe(1);
    expect(fit.columns).toBe(6);
  });

  it("does not zoom until the space is known", () => {
    expect(fitFocusedChart(team(15), { width: 0, height: 0 })).toEqual({
      columns: 15,
      scale: 1,
    });
  });
});
