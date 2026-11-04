import { savePlan } from "../src/shared/cache";
import type { LayoutPlan } from "../src/shared/plan";
import { startingProfile } from "../src/shared/profile";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel, PAGE_TO_PAGE_URL } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

const HOST = FIXTURE_ORIGIN.replace(/^https?:\/\//, "");

// No model proxy runs in tests. The worker's fetch is stood in for: it counts requests, takes a
// moment (so the drafting card can be seen) and then fails, which leaves the proposal in its
// error state. What matters here is whether a request was made, and how many.
async function standInForProxy(worker: { evaluate: (fn: () => void) => Promise<void> }) {
  await worker.evaluate(() => {
    const calls: Array<string> = [];
    (globalThis as unknown as { __proxyCalls: Array<string> }).__proxyCalls = calls;
    globalThis.fetch = async (input) => {
      calls.push(input instanceof Request ? input.url : String(input));
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return new Response("no proxy in tests", { status: 503 });
    };
  });
}

const proxyCalls = (worker: { evaluate: (fn: () => number) => Promise<number> }) =>
  worker.evaluate(() => (globalThis as unknown as { __proxyCalls: Array<string> }).__proxyCalls.length);

// On a site where the user keeps a layout, a page of a new kind is drafted by itself as they
// browse; a second page of the same kind the same day is not, and the switch turns it all off.
test("a new kind of page on a followed site gets a suggestion by itself, once a day per kind", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);
  const [worker] = context.serviceWorkers();
  await standInForProxy(worker);
  // The request carries the user's harbor; without one Harbor never asks by itself.
  await panel.evaluate((profile) => chrome.storage.local.set({ harborProfile: profile }), startingProfile("chosen"));

  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  // A layout kept on the catalog page, the way the user would keep one.
  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const summit = nodes.find((node) => node.text.startsWith("Summit 45"))!;
  const cards = nodes.filter((node) => node.parent === summit.parent);
  const plan: LayoutPlan = {
    summary: "Catalog",
    template: { urlPattern: `${HOST}/catalog.html`, pageKind: "catalog" },
    groups: [
      {
        label: "Backpack cards",
        urlPattern: `${HOST}/catalog.html`,
        role: "content-cards",
        container: summit.parent!,
        members: cards.map((card) => card.id),
        operation: "grid",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  expect(await proxyCalls(worker)).toBe(0);

  // A page of a kind nothing saved covers: drafted without a click, and the panel says so.
  await site.goto(`${FIXTURE_ORIGIN}/new-kind/cards.html`);
  await expect(panel.getByTestId("plan-progress-title")).toHaveText(`New kind of page on ${HOST}: drafting a layout from your harbor`, {
    timeout: 10_000,
  });
  await expect(panel.getByTestId("plan-error")).toContainText("asked automatically", { timeout: 10_000 });
  expect(await proxyCalls(worker)).toBe(1);
  const stored = (await panel.evaluate(() => chrome.storage.local.get("autoSuggested"))) as { autoSuggested: Record<string, number> };
  expect(Object.keys(stored.autoSuggested)).toEqual([`${HOST}/new-kind/cards.html`]);

  // The same kind of page again the same day: read, but not asked about.
  await site.goto(`${FIXTURE_ORIGIN}/new-kind/cards.html?again=1`);
  await expect(panel.getByText(`${FIXTURE_ORIGIN}/new-kind/cards.html?again=1`)).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByTestId("send-plan")).toBeVisible();
  await panel.waitForTimeout(1500);
  await expect(panel.getByTestId("plan-progress")).toHaveCount(0);
  expect(await proxyCalls(worker)).toBe(1);

  // Switched off in the settings: another new kind of page is read, and that is all.
  await panel.evaluate(() => chrome.storage.local.set({ autoSuggest: false }));
  await site.goto(`${FIXTURE_ORIGIN}/other-kind/docs.html`);
  await expect(panel.getByTestId("page-title")).toHaveText(/Lattice Docs/, { timeout: 10_000 });
  await expect(panel.getByTestId("send-plan")).toBeVisible();
  await panel.waitForTimeout(1500);
  await expect(panel.getByTestId("plan-progress")).toHaveCount(0);
  expect(await proxyCalls(worker)).toBe(1);
});

test("the settings page has the switch, on by default, and remembers it", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${PAGE_TO_PAGE_URL.OPTIONS}`);
  const toggle = page.getByTestId("auto-suggest");
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole("switch")).toBeChecked();
  await toggle.click();
  await expect(toggle.getByRole("switch")).not.toBeChecked();
  expect(await page.evaluate(() => chrome.storage.local.get("autoSuggest"))).toEqual({ autoSuggest: false });
});

// A page that already got changes from another page's saved layout (found by structure, not by
// URL) is drafted around them: they stay on the page while Spark works, and afterwards.
test("an automatic draft keeps the changes other pages' layouts put on the page", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  const [worker] = context.serviceWorkers();
  await standInForProxy(worker);
  await panel.evaluate((profile) => chrome.storage.local.set({ harborProfile: profile }), startingProfile("chosen"));
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  // The promo hidden, saved for this page only; not site chrome, so it travels by fingerprint alone.
  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const promo = nodes.find((node) => node.tag === "aside")!;
  const plan: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: `${HOST}/cards.html`, pageKind: "feed" },
    groups: [
      {
        label: "Promoted",
        urlPattern: `${HOST}/cards.html`,
        role: "other",
        container: promo.id,
        members: nodes.filter((node) => node.parent === promo.id).map((node) => node.id),
        operation: "hide-secondary",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toBeVisible();

  // Elsewhere on the site: the promo goes by itself, then Spark is asked, and the promo stays
  // hidden the whole time, through the failed answer too.
  await site.goto(`${FIXTURE_ORIGIN}/elsewhere/cards.html`);
  const hidden = () => site.locator(".frame").evaluate((element) => getComputedStyle(element).display);
  await expect.poll(hidden, { timeout: 10_000 }).toBe("none");
  await expect.poll(() => proxyCalls(worker), { timeout: 10_000 }).toBe(1);
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  expect(await hidden()).toBe("none");
  await expect(panel.getByTestId("plan-error")).toContainText("asked automatically", { timeout: 10_000 });
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  expect(await hidden()).toBe("none");
});
