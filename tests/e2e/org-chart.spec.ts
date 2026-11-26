/**
 * The org page against the mock director (`npm run dev:mock`): what a
 * person sees first, a team's drawer, a section that is remembered, and
 * what an accept in the history took.
 */
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("analytics-consent", "false");
    localStorage.setItem("openhands-telemetry-consent", "denied");
    localStorage.setItem("openhands-telemetry-first-use", "true");
    localStorage.setItem("openhands-onboarded", "1");
    localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "default-local",
          name: "Local QA",
          host: location.origin,
          apiKey: "",
          kind: "local",
        },
      ]),
    );
    localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({ backendId: "default-local", orgId: null }),
    );
  });
});

async function dismissConsent(page: Page) {
  const consent = page.getByRole("dialog", { name: "Help improve OpenHands" });
  await expect(consent).toBeVisible({ timeout: 30_000 });
  await consent.getByRole("checkbox").uncheck();
  await consent.getByRole("button", { name: "Confirm preferences" }).click();
  await expect(consent).toBeHidden();
}

async function openOrg(page: Page) {
  await page.goto("/org");
  await dismissConsent(page);
  await expect(page.getByTestId("org-node-root")).toBeVisible({
    timeout: 30_000,
  });
}

test("shows the org, what waits on the human, and a team's drawer", async ({
  page,
}) => {
  await openOrg(page);

  await expect(page.getByTestId("org-node-root")).toContainText(
    "Root organization",
  );
  for (const team of ["platform", "payments", "identity", "search"]) {
    await expect(page.getByTestId(`org-node-${team}`)).toBeVisible();
  }
  // One escalation reached the human; the sidebar says so on every page.
  await expect(page.getByTestId("sidebar-org-chart-link")).toContainText(
    "1 waiting on you",
  );
  const waiting = page.getByTestId("org-escalations");
  await expect(waiting).toContainText(
    "Idempotency keys collide across retries",
  );
  await expect(waiting.getByRole("textbox")).toBeVisible();

  await page.getByTestId("org-node-root").click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByTestId("org-node-conversations")).toContainText(
    "IC · Release 2.4",
  );
  await expect(drawer).toContainText("Documents");
});

test("goes to a team below when its card is chosen", async ({ page }) => {
  await openOrg(page);

  await page.getByTestId("org-node-payments").click();

  await expect(page).toHaveURL(/\/org\/payments$/);
  await expect(page.getByTestId("org-node-payments.worker")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Org chart path" }),
  ).toContainText("payments domain");
});

test("keeps a section as it was left across a reload", async ({ page }) => {
  await openOrg(page);
  const sessions = page.getByTestId("org-sessions-toggle");
  await expect(sessions).toHaveAttribute("aria-expanded", "false");

  await sessions.click();
  await expect(sessions).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("org-sessions")).toContainText("Release 2.4");

  await page.reload();
  await dismissConsent(page);

  await expect(sessions).toHaveAttribute("aria-expanded", "true");
});

test("opens the files of an accept in the history, and a file's diff", async ({
  page,
}) => {
  await openOrg(page);

  await page.getByTestId("org-history-toggle").click();
  const history = page.getByTestId("org-history");
  await expect(history).toContainText("work accepted (at review 2)");
  // Only the accept has files to show.
  const files = history.getByTestId("org-history-files");
  await expect(files).toHaveCount(1);

  await files.click();
  const rows = history.getByTestId("accepted-file");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("payments/src/main.py");

  await rows.first().getByTestId("collapse").click();
  await expect(rows.first().locator(".monaco-diff-editor")).toBeVisible({
    timeout: 30_000,
  });
  await expect(rows.first()).toContainText("idempotency_key");
});
