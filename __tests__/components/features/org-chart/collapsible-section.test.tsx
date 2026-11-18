import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "#/components/features/org-chart/collapsible-section";

function section(testId: string, startsOpen: boolean) {
  return (
    <CollapsibleSection title="Part" testId={testId} startsOpen={startsOpen}>
      <p>inside</p>
    </CollapsibleSection>
  );
}

describe("CollapsibleSection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("comes back as the human left it, not as it starts", async () => {
    const first = render(section("part-a", false));
    expect(screen.queryByText("inside")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("part-a-toggle"));
    expect(screen.getByText("inside")).toBeInTheDocument();
    first.unmount();

    const second = render(section("part-a", false));
    expect(screen.getByText("inside")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("part-a-toggle"));
    second.unmount();

    render(section("part-a", true));
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("remembers each part apart from the others", async () => {
    const first = render(section("part-a", false));
    await userEvent.click(screen.getByTestId("part-a-toggle"));
    first.unmount();

    render(section("part-b", false));
    expect(screen.queryByText("inside")).not.toBeInTheDocument();
  });

  it("starts as it does by default when nothing can be kept", () => {
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage is off");
      });
    render(section("part-a", true));
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(read).toHaveBeenCalled();
    read.mockRestore();
  });
});
