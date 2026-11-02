import { savePlan } from "../src/shared/cache";
import type { LayoutPlan, PlanGroup } from "../src/shared/plan";
import type { TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// Day 3 exit check on an owned, uninstrumented page: preview → cancel → preview → keep →
// the original links and tab order still work → restore → re-apply survives a reload.
test("preview, apply and restore a layout on the real page", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const matches = nodes.filter((node) => /^(Rotate keys|Scopes|OAuth apps|Rate limits) /.test(node.text));
  const tiles = matches.filter((node) => matches.some((other) => other.id === node.parent));
  const toc = nodes.find((node) => node.text.startsWith("On this page"))!;
  const plan: LayoutPlan = {
    summary: "Docs page",
    template: { urlPattern: "127.0.0.1:4317/docs.html", pageKind: "docs" },
    groups: [
      {
        label: "Next steps cards",
        urlPattern: "127.0.0.1:4317/docs.html",
        role: "content-cards",
        container: tiles[0].parent!,
        members: tiles.map((tile) => tile.id),
        operation: "grid",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
      {
        label: "On this page",
        urlPattern: "127.0.0.1:4317/docs.html",
        role: "navigation",
        container: toc.id,
        members: nodes.filter((node) => node.parent === toc.id && node.tag === "a").map((node) => node.id),
        operation: "emphasize",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();

  const cards = site.locator(".grid");
  const display = () => cards.evaluate((element) => getComputedStyle(element).display);
  expect(await display()).toBe("flex");

  // Preview outlines the regions and changes the page; Escape on the page undoes it.
  await panel.getByTestId("preview-layout").click();
  await expect.poll(display).toBe("grid");
  await expect(site.locator("html")).toHaveAttribute("data-smart-web-preview", "");
  await site.keyboard.press("Escape");
  await expect.poll(display).toBe("flex");
  await expect(panel.getByTestId("preview-layout")).toBeVisible();

  // Untick one group, preview, keep.
  const tocRow = panel.getByTestId("plan-group").filter({ hasText: "On this page" });
  await tocRow.getByText("On this page", { exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: "Include On this page" })).not.toBeChecked();
  await panel.getByTestId("preview-layout").click();
  await expect.poll(display).toBe("grid");
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toHaveText("1 change on the page");
  await expect(site.locator("html")).not.toHaveAttribute("data-smart-web-preview", "");
  expect(await site.locator(".toc").evaluate((element) => element.hasAttribute("data-smart-web-op"))).toBe(false);

  // The site still works: its own link navigates, and Tab moves through the cards in source order.
  const card = (name: string) => cards.getByRole("link", { name });
  await card("Rotate keys").focus();
  await site.keyboard.press("Tab");
  await expect(card("Scopes")).toBeFocused();
  await card("Scopes").click();
  await expect(site).toHaveURL(/docs\.html#$/);

  // Restore leaves no trace on the page.
  await panel.getByTestId("restore-layout").click();
  await expect.poll(display).toBe("flex");
  expect(await site.locator("[data-smart-web-op], [data-smart-web-member], [data-smart-web-group]").count()).toBe(0);

  // An applied layout follows the tab through a full reload, from the saved plan.
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  await site.reload();
  await expect(panel.getByTestId("layout-applied")).toBeVisible({ timeout: 10_000 });
  await expect.poll(display, { timeout: 10_000 }).toBe("grid");
});

// hide-secondary hides for real; in preview it stays visible but dimmed; unticking it after
// Keep shows it again without restoring the rest.
test("hidden regions are dimmed in preview, hidden after Keep, and shown again from the panel", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const footer = nodes.find((node) => node.text.startsWith("Privacy Terms"))!;
  const toc = nodes.find((node) => node.text.startsWith("On this page"))!;
  const group = (label: string, container: string, operation: PlanGroup["operation"]): PlanGroup => ({
    label,
    urlPattern: "127.0.0.1:4317/*",
    role: "other",
    container,
    members: nodes.filter((node) => node.parent === container).map((node) => node.id),
    operation,
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: "",
  });
  const plan: LayoutPlan = {
    summary: "Docs page",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "docs" },
    groups: [group("Footer links", footer.id, "hide-secondary"), group("On this page", toc.id, "emphasize")],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();

  const foot = site.locator(".foot");
  const style = () => foot.evaluate((element) => ({ display: getComputedStyle(element).display, opacity: getComputedStyle(element).opacity }));

  await panel.getByTestId("preview-layout").click();
  await expect.poll(style).toEqual({ display: "flex", opacity: "0.35" });

  await panel.getByTestId("keep-layout").click();
  await expect.poll(style).toEqual({ display: "none", opacity: "1" });
  await expect(panel.getByTestId("layout-hidden")).toContainText("Footer links");

  // Untick while applied: the footer comes back, the emphasized TOC stays.
  await panel.getByTestId("adjust-changes").locator("summary").click();
  await panel.getByTestId("plan-group").filter({ hasText: "Footer links" }).getByText("Footer links", { exact: true }).click();
  await expect.poll(style).toEqual({ display: "flex", opacity: "1" });
  await expect(panel.getByTestId("layout-applied")).toHaveText("1 change on the page");
  await expect.poll(() => site.locator(".toc").getAttribute("data-smart-web-op")).toBe("emphasize");
});

// A plan may name a wide container for one member: hiding "Privacy" in the footer must not take
// Terms and Security with it. When the members are most of the region, the region itself goes.
test("hiding one member of a region leaves the rest of the region", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/docs.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const footer = nodes.find((node) => node.text.startsWith("Privacy Terms"))!;
  const privacy = nodes.find((node) => node.parent === footer.id && node.text === "Privacy")!;
  const toc = nodes.find((node) => node.text.startsWith("On this page"))!;
  // The heading is scanned too, so the links are most of the box but not all of it.
  expect(nodes.some((node) => node.parent === toc.id && node.tag !== "a")).toBe(true);
  const hide = (label: string, container: string, members: Array<string>): PlanGroup => ({
    label,
    urlPattern: "127.0.0.1:4317/*",
    role: "other",
    container,
    members,
    operation: "hide-secondary",
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: "",
  });
  const plan: LayoutPlan = {
    summary: "Docs page",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "docs" },
    groups: [
      hide("Privacy link", footer.id, [privacy.id]),
      // Its links, not its "On this page" heading: the links are most of it, so the box goes too.
      hide("On this page", toc.id, nodes.filter((node) => node.parent === toc.id && node.tag === "a").map((node) => node.id)),
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();

  const foot = site.locator(".foot");
  await expect(foot.getByRole("link", { name: "Privacy" })).toBeHidden();
  await expect(foot.getByRole("link", { name: "Terms" })).toBeVisible();
  await expect(foot).toBeVisible();
  await expect(site.locator(".toc")).toBeHidden();
});

// Hiding everything inside a card hides the card's frame too, instead of leaving an empty box;
// the cards around it stay, and Restore brings the frame back.
test("hiding a card's only content takes its empty frame with it", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();

  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const promo = nodes.find((node) => node.tag === "aside")!;
  const plan: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "feed" },
    groups: [
      {
        label: "Promoted",
        urlPattern: "127.0.0.1:4317/*",
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

  const display = (selector: string) => () => site.locator(selector).first().evaluate((element) => getComputedStyle(element).display);
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await expect.poll(display(".frame")).toBe("none");
  await expect.poll(display(".post")).toBe("block");

  await panel.getByTestId("restore-layout").click();
  await expect.poll(display(".frame")).toBe("block");
});

// Keep is remembered for the layout's pattern: another page it covers gets the layout as soon as
// Harbor reads it, with no preview and no Meta call. Restore turns that off.
test("a kept layout comes back by itself on the next page, until Restore", async ({ context, extensionId }) => {
  const first = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  await first.panel.getByRole("button", { name: "Read this page" }).click();
  await expect(first.panel.getByTestId("screenshot")).toBeVisible();
  const session = (await first.panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${first.tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  const promo = nodes.find((node) => node.tag === "aside")!;
  const plan: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "feed" },
    groups: [
      {
        label: "Promoted",
        urlPattern: "127.0.0.1:4317/*",
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
  await first.panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await first.panel.getByRole("button", { name: "Rescan" }).click();
  await first.panel.getByTestId("preview-layout").click();
  await first.panel.getByTestId("keep-layout").click();
  await expect(first.panel.getByTestId("layout-applied")).toBeVisible();

  const frame = (page: typeof first.site) => () => page.locator(".frame").evaluate((element) => getComputedStyle(element).display);
  const second = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/again/cards.html`);
  await second.panel.getByRole("button", { name: "Read this page" }).click();
  await expect(second.panel.getByTestId("layout-applied")).toBeVisible();
  await expect.poll(frame(second.site)).toBe("none");

  await second.panel.getByTestId("restore-layout").click();
  await expect.poll(frame(second.site)).toBe("block");
  const third = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/third/cards.html`);
  await third.panel.getByRole("button", { name: "Read this page" }).click();
  await expect(third.panel.getByTestId("preview-layout")).toBeVisible();
  await expect.poll(frame(third.site)).toBe("block");
});

// The page's own header is site chrome: a change to it, kept on one page, applies on another page
// of the site even when that page has a plan of its own.
test("a kept change to the site header follows the user to other pages", async ({ context, extensionId }) => {
  const first = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  await first.panel.getByRole("button", { name: "Read this page" }).click();
  await expect(first.panel.getByTestId("screenshot")).toBeVisible();
  const session = (await first.panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${first.tabId}`)) as TabSession;
  const scan = session.scan!;
  const nav = scan.nodes.find((node) => node.tag === "nav")!;
  const promo = scan.nodes.find((node) => node.tag === "aside")!;
  const group = (label: string, container: string, operation: PlanGroup["operation"], urlPattern: string): PlanGroup => ({
    label,
    urlPattern,
    role: "other",
    container,
    members: scan.nodes.filter((node) => node.parent === container).map((node) => node.id),
    operation,
    reorderable: false,
    identity: { source: "none", attribute: "" },
    reason: "",
  });
  // This page's plan: the header (site-wide) and its promo. The other page's own plan: only its promo.
  const here: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "feed" },
    groups: [group("Top navigation", nav.id, "emphasize", "127.0.0.1:4317/*"), group("Promoted", promo.id, "hide-secondary", "127.0.0.1:4317/cards.html")],
  };
  const other: LayoutPlan = {
    summary: "Other page",
    template: { urlPattern: "127.0.0.1:4317/b/*", pageKind: "feed" },
    groups: [group("Promoted here", promo.id, "hide-secondary", "127.0.0.1:4317/b/*")],
  };
  const otherScan = { ...scan, url: `${FIXTURE_ORIGIN}/b/cards.html` };
  await first.panel.evaluate((entries) => chrome.storage.local.set({ savedPlans: entries }), [
    savePlan(here, scan, false, Date.now()),
    savePlan(other, otherScan, false, Date.now() - 1000),
  ]);
  await first.panel.getByRole("button", { name: "Rescan" }).click();
  await first.panel.getByTestId("preview-layout").click();
  await first.panel.getByTestId("keep-layout").click();
  await expect(first.panel.getByTestId("layout-applied")).toHaveText("2 changes on the page");

  const second = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/b/cards.html`);
  await second.panel.getByRole("button", { name: "Read this page" }).click();
  // The header change is applied by itself; the page's own promo change waits for a preview.
  await expect(second.panel.getByTestId("layout-applied")).toHaveText("1 change on the page");
  await expect.poll(() => second.site.locator(".topnav").getAttribute("data-smart-web-op")).toBe("emphasize");
  await expect.poll(() => second.site.locator(".frame").evaluate((element) => getComputedStyle(element).display)).toBe("block");
});

// A learned favourite inside a nav link (its icon or label) moves the whole list item to the front
// of the bar, not the icon within its own link. Shaped like LinkedIn's top bar.
test("a learned favourite moves its whole nav item to the front of the bar", async ({ context, extensionId }) => {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/cards.html`);
  await panel.getByRole("button", { name: "Read this page" }).click();
  await expect(panel.getByTestId("screenshot")).toBeVisible();
  const session = (await panel.evaluate(async (key) => (await chrome.storage.session.get(key))[key], `session:${tabId}`)) as TabSession;
  const nodes = session.scan!.nodes;
  // The deepest scanned node for Jobs, as a click on its label would record.
  const jobs = nodes.filter((node) => node.text === "Jobs" || node.text.startsWith("▣")).toSorted((a, b) => b.depth - a.depth)[0];
  const plan: LayoutPlan = {
    summary: "Feed",
    template: { urlPattern: "127.0.0.1:4317/*", pageKind: "feed" },
    groups: [
      {
        label: "You open most: Jobs",
        urlPattern: "127.0.0.1:4317/*",
        role: "other",
        container: jobs.id,
        members: [jobs.id],
        operation: "emphasize",
        reorderable: false,
        identity: { source: "none", attribute: "" },
        reason: "Learned",
        origin: "learned",
      },
    ],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();

  const item = site.locator(".topnav li").filter({ hasText: "Jobs" });
  await expect.poll(() => item.evaluate((element) => getComputedStyle(element).order)).toBe("-1");
  // First on screen, still second in the DOM.
  const lefts = await site.locator(".topnav li").evaluateAll((items) => items.map((element) => element.getBoundingClientRect().left));
  expect(lefts[1]).toBeLessThan(lefts[0]);
});
