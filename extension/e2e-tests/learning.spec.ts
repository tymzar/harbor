import { savePlan } from "../src/shared/cache";
import type { SiteRanker } from "../src/shared/page-ranker";
import type { LayoutPlan } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Learning that changes the page (system plan, required proof): real clicks on one product card
// of a kept layout → a suggestion in the panel → accepted → that card is emphasised on the page →
// restore leaves nothing. Scripted clicks are not counted; nothing happens before the user accepts.
test("clicks on one item lead to a suggestion that changes the page once accepted", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const summit = nodes.find((node) => node.text.startsWith("Summit 45"))!;
  const cards = nodes.filter((node) => node.parent === summit.parent);
  const plan: LayoutPlan = {
    summary: "Catalog",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "catalog" },
    groups: [
      {
        label: "Backpack cards",
        urlPattern: "127.0.0.1:4317/catalog.html",
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
  await expect(panel.getByTestId("learning")).toBeVisible();

  const card = site.locator(".p").filter({ hasText: "Summit 45" });
  const name = card.locator(".name");

  // Off by default: clicks are not counted.
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("Off");

  await panel.getByText("Learn what I open on this site").click();
  await expect(panel.getByTestId("learning-status")).toContainText("0 clicks counted");

  // A scripted click is not the user's.
  await name.evaluate((element) => (element as HTMLElement).click());
  await name.click();
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("2 clicks counted");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  await name.click();
  await expect(panel.getByTestId("suggestion")).toContainText("Summit 45");

  // The suggestion came from the site's neural ranker, trained on these three presses: its
  // network has one output per card and was fed the presses' pointer features.
  const saved = (await panel.evaluate(async () => (await chrome.storage.local.get("rankers")).rankers)) as Record<string, SiteRanker>;
  const model = saved[FIXTURE_ORIGIN];
  expect(model.catalog.groups).toHaveLength(1);
  expect(model.catalog.groups[0].items).toHaveLength(cards.length);
  expect(model.model.examples).toBe(3);
  // Three presses on top of the normaliser's 20 prior observations; Playwright presses are much
  // shorter than the ~100 ms prior, so the press-length mean moved: real features reached the model.
  expect(model.model.normStats.count).toBe(23);
  expect(model.model.normStats.mean[0]).toBeLessThan(4.6);
  expect(await card.getAttribute("data-smart-web-op")).toBeNull();

  // The model, live in the panel: the reused network picture, with Summit as the top card.
  await panel.getByTestId("model-toggle").click();
  const network = panel.getByTestId("network-view");
  await expect(network).toBeVisible();
  await expect(network).toHaveAttribute("data-top", /Summit/);
  await expect(panel.getByTestId("network-output")).toHaveCount(5);
  await expect(panel.getByTestId("network-output").first()).toContainText("Summit 45");

  await panel.getByTestId("suggestion-accept").click();
  await expect.poll(() => card.getAttribute("data-smart-web-op")).toBe("emphasize");
  // Moved to the front of its row on screen; the DOM order, and so tab order, stays the site's own.
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).order)).toBe("-1");
  expect(await card.evaluate((element) => [...element.parentElement!.children].indexOf(element))).toBeGreaterThan(0);
  await expect(panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  // Decided once: more clicks don't bring the same suggestion back.
  await name.click();
  await expect(panel.getByTestId("learning-status")).toContainText("4 clicks counted");
  await expect(panel.getByTestId("suggestion")).toHaveCount(0);

  // Saved with the plan: reading the page again brings the learned emphasis back, with no model call.
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await expect.poll(() => card.getAttribute("data-smart-web-op")).toBe("emphasize");
  await expect(panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");

  await panel.getByTestId("restore-layout").click();
  await expect.poll(() => site.locator("[data-smart-web-op], [data-smart-web-member]").count()).toBe(0);
});

// Learning also covers regions the plan leaves as they are: on GitHub the repository tabs are
// "no change", and Pull requests is what the user opens most.
test("clicks in a region the plan leaves alone still teach the model", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/catalog.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();
  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const summit = nodes.find((node) => node.text.startsWith("Summit 45"))!;
  const pages = nodes.find((node) => node.text.startsWith("1 2 3 Next"))!;
  const group = (label: string, container: string, members: Array<string>, operation: LayoutPlan["groups"][number]["operation"]) => ({
    label,
    urlPattern: "127.0.0.1:4317/catalog.html",
    role: "other" as const,
    container,
    members,
    operation,
    reorderable: false,
    identity: { source: "none" as const, attribute: "" },
    reason: "",
  });
  const plan: LayoutPlan = {
    summary: "Catalog",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "catalog" },
    groups: [
      group("Backpack cards", summit.parent!, nodes.filter((node) => node.parent === summit.parent).map((node) => node.id), "none"),
      group("Pagination", pages.id, nodes.filter((node) => node.parent === pages.id).map((node) => node.id), "hide-secondary"),
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await panel.getByText("Learn what I open on this site").click();

  const card = site.locator(".p").filter({ hasText: "Summit 45" });
  for (let click = 0; click < 3; click += 1) await card.locator(".name").click();
  await expect(panel.getByTestId("suggestion")).toContainText("Summit 45");
  // Watched, not changed: nothing on the cards was marked.
  expect(await card.getAttribute("data-smart-web-op")).toBeNull();
  await expect(panel.getByTestId("layout-missing")).toHaveCount(0);
});

// Where the page can rearrange a row (LinkedIn-shaped top bar), the panel says so, and enough
// clicks lead to a whole order: accepted, the items take that order on screen, not in the DOM.
test("clicks on a nav bar lead to the user's own order of it", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();
  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const links = nodes.filter((node) => node.tag === "a" && /Home|Jobs|Messaging/.test(node.text));
  const promo = nodes.find((node) => node.tag === "aside")!;
  const base = { urlPattern: "127.0.0.1:4317/*", role: "other" as const, reorderable: true, reason: "" };
  const plan: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "feed" },
    groups: [
      { ...base, label: "Top navigation", container: nodes.find((node) => node.tag === "ul")!.id, members: links.map((link) => link.id), operation: "none", identity: { source: "text", attribute: "" } },
      { ...base, reorderable: false, label: "Promoted", container: promo.id, members: nodes.filter((node) => node.parent === promo.id).map((node) => node.id), operation: "hide-secondary", identity: { source: "none", attribute: "" } },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await expect(panel.getByTestId("plan-group").filter({ hasText: "Top navigation" }).getByTestId("group-orderable")).toBeVisible();
  await expect(panel.getByTestId("plan-group").filter({ hasText: "Promoted" }).getByTestId("group-orderable")).toHaveCount(0);
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await panel.getByText("Learn what I open on this site").click();
  await expect(panel.getByTestId("order-row")).toContainText("0 of 8 clicks");

  const link = (name: string) => site.locator(".topnav a").filter({ hasText: name });
  // Messaging most, then Jobs; Home never. Dismiss the one-item offer if it comes first.
  for (const name of ["Messaging", "Jobs", "Messaging", "Jobs", "Messaging", "Messaging", "Jobs", "Messaging"]) {
    await link(name).click();
    if (await panel.getByTestId("suggestion").count() && !(await panel.getByTestId("suggestion-order").count())) await panel.getByTestId("suggestion-dismiss").click();
  }
  await expect(panel.getByTestId("suggestion-order")).toContainText(/Messaging.*Jobs.*Home/);
  if (process.env.SHOT) await panel.getByTestId("learning").screenshot({ path: process.env.SHOT });
  await panel.getByTestId("suggestion-accept").click();
  await expect(panel.getByTestId("order-row")).toContainText("Your order is on");

  const left = (name: string) => site.locator(".topnav li").filter({ hasText: name }).evaluate((element) => element.getBoundingClientRect().left);
  await expect.poll(async () => (await left("Messaging")) < (await left("Jobs")) && (await left("Jobs")) < (await left("Home"))).toBe(true);
  // The DOM keeps the site's order.
  expect(await site.locator(".topnav li").allInnerTexts()).toEqual([expect.stringContaining("Home"), expect.stringContaining("Jobs"), expect.stringContaining("Messaging")]);
});
