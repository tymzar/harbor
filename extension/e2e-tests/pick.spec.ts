import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// "Hide something else" works without any plan from Meta: point, click, widen, hide.
test("pick an element on the page, widen the selection and hide it", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Scan page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  await panel.getByTestId("pick-start").click();
  await expect(panel.getByTestId("pick-pointing")).toBeVisible();

  // Point at the footer's "Privacy" link and click: the click is captured, the link isn't followed.
  const privacy = await site.locator(".foot").getByRole("link", { name: "Privacy" }).boundingBox();
  await site.mouse.move(privacy!.x + 5, privacy!.y + 5);
  await expect(site.locator("[data-smart-web-picker]")).toContainText("Privacy");
  await site.mouse.click(privacy!.x + 5, privacy!.y + 5);
  await expect(panel.getByTestId("pick-selected")).toContainText("<a> Privacy");
  expect(site.url()).not.toContain("#");

  await panel.getByTestId("pick-wider").click();
  await expect(panel.getByTestId("pick-selected")).toContainText("Privacy Terms Security");
  await panel.getByTestId("pick-hide").click();

  const footer = site.locator(".foot");
  await expect.poll(() => footer.evaluate((element) => getComputedStyle(element).display)).toBe("none");
  await expect(site.locator("[data-smart-web-picker]")).toHaveCount(0);
  await expect(panel.getByTestId("plan-group").filter({ hasText: "Hidden by you" })).toHaveCount(1);
  // What is hidden on the page is ticked in the panel.
  await expect(panel.getByRole("checkbox", { name: /^Include Hidden by you: Privacy/ })).toBeChecked();
  await expect(panel.getByTestId("layout-hidden")).toContainText("Hidden by you: Privacy Terms Security");

  // Saved with the plan: still hidden after a rescan, without asking Meta.
  const scannedAt = async () =>
    ((await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession).scan
      ?.scannedAt ?? 0;
  const lastScan = await scannedAt();
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect.poll(scannedAt).toBeGreaterThan(lastScan);
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await expect.poll(() => footer.evaluate((element) => getComputedStyle(element).display)).toBe("none");

  // Keyboard path: the element list's Hide button.
  await panel.getByTestId("element-list").getByText(/^All \d+ elements on this page$/).click();
  const teams = panel.getByRole("button", { name: "Hide Teams on the page" });
  await teams.focus();
  await panel.keyboard.press("Enter");
  await expect
    // A CSS locator: role locators skip hidden elements, so they can't observe the hide itself.
    .poll(() => site.locator(".side a", { hasText: /^Teams$/ }).evaluate((element) => getComputedStyle(element).display))
    .toBe("none");
  await expect(panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");
});

// Node IDs are only valid for the scan they came from; the page refuses older ones instead of
// marking whatever elements now carry those IDs (seen live on GitHub: a rescan mid-pick).
test("the page refuses node IDs from an earlier scan", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Scan page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const [worker] = context.serviceWorkers();
  const result = await worker.evaluate(async (id) => {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: id },
      func: () => globalThis.smartWeb!.apply([{ label: "Old", container: "n1", members: ["n2"], operation: "hide-secondary" }], false, 1),
    });
    return injection.result;
  }, tabId);
  expect(result).toEqual({ applied: [], missing: ["Old"], stale: true });
  expect(await site.locator("[data-smart-web-op]").count()).toBe(0);
});
