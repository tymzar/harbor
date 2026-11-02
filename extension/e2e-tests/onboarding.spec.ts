import type { Profile } from "../src/shared/profile";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// First open: three picks and a result, saved on this device; then the panel shows the harbor
// with the special request folded away.
test("first open walks through the setup and saves the harbor", async ({ context, extensionId }) => {
  const [worker] = context.serviceWorkers();
  await worker.evaluate(() => chrome.storage.local.remove("harborOnboarding"));
  const { panel } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);

  await expect(panel.getByTestId("onboarding")).toBeVisible();
  await panel.getByRole("button", { name: /Compact grid/ }).click();
  await panel.getByRole("button", { name: /The content itself/ }).click();
  // Ads and pop-ups start cleared; fold comments.
  await panel.getByTestId("part-comments").getByRole("radio", { name: "Fold" }).click().catch(async () => {
    await panel.getByTestId("part-comments").getByRole("button", { name: "Fold" }).click();
  });
  await panel.getByTestId("onboarding-next").click();
  await expect(panel.getByTestId("harbor-name")).toHaveText("Quick reader");
  await panel.getByTestId("onboarding-done").click();

  const profile = (await panel.evaluate(async () => {
    const stored = await chrome.storage.local.get("harborProfile");
    return stored.harborProfile;
  })) as Profile;
  expect(profile.layout).toEqual({ density: "compact", structure: "grid", emphasis: "main" });
  expect(profile.parts.ads).toBe("hide");
  expect(profile.parts.comments).toBe("fold");
  expect(profile.parts.sidebarExtras).toBeUndefined();

  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("harbor-row")).toContainText("Quick reader");
  await expect(panel.getByTestId("special-request")).not.toHaveAttribute("open", "");
});

test("skipping the setup starts from Harbor's defaults", async ({ context, extensionId }) => {
  const [worker] = context.serviceWorkers();
  await worker.evaluate(() => chrome.storage.local.remove("harborOnboarding"));
  const { panel } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);
  await panel.getByTestId("onboarding-skip").click();
  await expect(panel.getByRole("button", { name: "Read this page" })).toBeVisible();
  const profile = (await panel.evaluate(async () => {
    const stored = await chrome.storage.local.get("harborProfile");
    return stored.harborProfile;
  })) as Profile;
  expect(profile.source).toBe("defaults");
  expect(profile.parts).toMatchObject({ ads: "hide", popups: "hide" });
});
