import type { BrowserContext, Page } from "@playwright/test";

import { savePlan } from "../src/shared/cache";
import type { LayoutPlan, PlanGroup } from "../src/shared/plan";
import type { ScanNode, TabSession } from "../src/shared/types";
import { test, expect, openWithPanel } from "./fixtures";
import { FIXTURE_ORIGIN } from "../playwright.config";

// A style change on a repeated list reaches every like item. On Gmail a kept "Compact" reached the
// rows the scan had seen, about the first 18, and left two row heights in one list.
//
// These tests look only at what the user can see (heights, display, opacity), never at how Harbor
// marks the page. The plan names only the rows in view, as a real plan does.

const URL_PATTERN = `${new URL(FIXTURE_ORIGIN).host}/mail-list.html`;
const PRIORITY = "rows-priority";
const REST = "rows-rest";
// How long Harbor gets to pick up a change on the page.
const REACH = { timeout: 10_000 };
// How long to wait before saying something did NOT happen to a row.
const SETTLE_MS = 1500;
const SAME_HEIGHT_WITHIN = 0.5;

type Row = { mail: number; section: string; height: number; display: string; opacity: number };

const readRows = (site: Page) =>
  site.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("tr.mail")].map((row): Row => {
      const style = getComputedStyle(row);
      return {
        mail: Number(row.dataset.mail),
        section: row.closest("tbody")!.id,
        height: row.getBoundingClientRect().height,
        display: style.display,
        opacity: Number(style.opacity),
      };
    })
  );

// "ok", or which rows are off: a failed poll then says how many rows, and which, missed.
async function heightReport(site: Page, height: number, among: (row: Row) => boolean = () => true): Promise<string> {
  const all = await readRows(site);
  const rows = all.filter((row) => among(row));
  const off = rows.filter((row) => Math.abs(row.height - height) > SAME_HEIGHT_WITHIN);
  if (rows.length === 0) return "no rows to check";
  if (off.length === 0) return "ok";
  const sample = off.slice(0, 4).map((row) => `#${row.mail} in ${row.section} is ${row.height}px`);
  return `${off.length} of ${rows.length} rows are not ${height}px: ${sample.join(", ")}`;
}

// The rows that aren't like the mail: their box, and the styles that would move if a list-wide
// change caught them. Nothing here may ever differ from what the site drew.
const readOthers = (site: Page) =>
  site.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("tr.section-head, tr.list-foot")].map((row) => {
      const style = getComputedStyle(row);
      const cell = getComputedStyle(row.querySelector("td")!);
      return {
        text: row.textContent,
        height: row.getBoundingClientRect().height,
        display: style.display,
        opacity: style.opacity,
        background: style.backgroundColor,
        lineHeight: style.lineHeight,
        fontSize: cell.fontSize,
        padding: cell.padding,
      };
    })
  );

const appendMail = (site: Page, count: number, section = PRIORITY) =>
  site.evaluate(
    ([many, where]) => (globalThis as unknown as { appendMail: (count: number, section: string) => Array<number> }).appendMail(many, where),
    [count, section] as [number, string]
  );

// Opens the inbox, reads it, and has Harbor reuse a plan built from what the scan saw (no model call).
async function openWithPlan(
  context: BrowserContext,
  extensionId: string,
  makeGroup: (body: ScanNode, rows: Array<ScanNode>) => PlanGroup
) {
  const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/mail-list.html`);

  // What the page is before Harbor touches it. If these fail the fixture is wrong, not Harbor.
  const original = await readRows(site);
  expect(original.length, "the fixture has well over a screenful of rows").toBeGreaterThan(200);
  const rowHeight = original[0].height;
  expect(await heightReport(site, rowHeight), "like rows start the same height").toBe("ok");
  const others = await readOthers(site);
  expect(others.map((row) => row.height).every((height) => height !== rowHeight), "headers and footers are a different height").toBe(true);
  const lastTop = await site.locator("tr.mail").last().evaluate((row) => row.getBoundingClientRect().top - innerHeight);
  expect(lastTop, "the last row is far below the fold").toBeGreaterThan(5000);

  // The panel can read the page by itself as it opens; then there is no button left to press.
  const read = panel.getByRole("button", { name: "Read this page" });
  const screenshot = panel.getByTestId("screenshot");
  await expect(read.or(screenshot).first()).toBeVisible();
  if (await read.isVisible()) await read.click({ timeout: 2000 }).catch(() => {});
  await expect(screenshot).toBeVisible();
  const session = (await panel.evaluate(async (key) => {
    const stored = await chrome.storage.session.get(key);
    return stored[key];
  }, `session:${tabId}`)) as TabSession;
  const nodes = session.scan?.nodes ?? [];
  const body = nodes.find((node) => node.tag === "tbody" && node.attrs?.id === PRIORITY);
  expect(body, "the scan sees the list").toBeDefined();
  const rows = nodes.filter((node) => node.tag === "tr" && node.parent === body!.id && node.attrs?.["data-mail"] !== undefined);
  // A real plan never lists a whole inbox: at most this many, as many as Gmail's plan named.
  const named = rows.slice(0, 18);
  expect(named.length, "the plan can name a few rows").toBeGreaterThanOrEqual(8);

  const plan: LayoutPlan = {
    summary: "Inbox",
    template: { urlPattern: URL_PATTERN, pageKind: "inbox" },
    groups: [makeGroup(body!, named)],
  };
  await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
  await panel.getByRole("button", { name: "Rescan" }).click();
  await expect(panel.getByTestId("plan-reused")).toBeVisible();

  return { site, panel, rowHeight, others, named: named.map((node) => Number(node.attrs!["data-mail"])) };
}

const group = (label: string, body: ScanNode, members: Array<ScanNode>, operation: PlanGroup["operation"]): PlanGroup => ({
  label,
  urlPattern: URL_PATTERN,
  role: "list",
  container: body.id,
  members: members.map((node) => node.id),
  operation,
  reorderable: false,
  identity: { source: "none", attribute: "" },
  reason: "",
});

const openWithCompact = (context: BrowserContext, extensionId: string) =>
  openWithPlan(context, extensionId, (body, rows) => group("Mail rows", body, rows, "compact"));

// The rows the plan names do tighten. That's today's behaviour, so a failure here is a setup problem,
// and the height they reach is the height every other row must match.
async function compactHeight(site: Page, named: Array<number>, rowHeight: number): Promise<number> {
  const firstNamed = () => readRows(site).then((rows) => rows.find((row) => row.mail === named[0])!.height);
  await expect.poll(firstNamed, { ...REACH, message: "the rows the plan names are compact" }).toBeLessThan(rowHeight - 4);
  return firstNamed();
}

async function keep(panel: Page) {
  await panel.getByTestId("preview-layout").click();
  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
}

test.describe("a style change on a repeated list reaches every like item", () => {
  test("after Keep every row in the list has the same compact height, far below the fold too", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);

    await expect.poll(() => heightReport(site, compact, (row) => row.section === PRIORITY), REACH).toBe("ok");
    expect(await readOthers(site)).toEqual(others);
  });

  test("after Keep the second section's rows of the same shape are compact too", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);

    await expect.poll(() => heightReport(site, compact, (row) => row.section === REST), REACH).toBe("ok");

    const added = await appendMail(site, 5, REST);
    await expect.poll(() => heightReport(site, compact, (row) => added.includes(row.mail)), REACH).toBe("ok");
    expect(await readOthers(site)).toEqual(others);
  });

  test("rows appended after Keep become compact", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);

    // One batch and then another: the site keeps adding for as long as the user scrolls.
    for (const count of [12, 3]) {
      const added = await appendMail(site, count);
      expect(added).toHaveLength(count);
      await expect.poll(() => heightReport(site, compact, (row) => added.includes(row.mail)), REACH).toBe("ok");
    }
    expect(await readOthers(site)).toEqual(others);
  });

  test("Preview reaches every row, and Cancel returns them all", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);

    await panel.getByTestId("preview-layout").click();
    const compact = await compactHeight(site, named, rowHeight);
    await expect.poll(() => heightReport(site, compact), REACH).toBe("ok");
    expect(await readOthers(site)).toEqual(others);

    await panel.getByTestId("cancel-layout").click();
    await expect.poll(() => heightReport(site, rowHeight), REACH).toBe("ok");
    await expect(panel.getByTestId("preview-layout")).toBeVisible();
    expect(await readOthers(site)).toEqual(others);

    // Cancelled means cancelled: what the site adds afterwards is left alone.
    const added = await appendMail(site, 5);
    await site.waitForTimeout(SETTLE_MS);
    expect(await heightReport(site, rowHeight, (row) => added.includes(row.mail))).toBe("ok");
  });

  test("Restore returns every row to its original height, rows appended after Keep included", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);

    // Restore has to find these too, so first they have to have been changed.
    await appendMail(site, 6);
    await appendMail(site, 4, REST);
    await expect.poll(() => heightReport(site, compact), REACH).toBe("ok");

    await panel.getByTestId("restore-layout").click();
    await expect.poll(() => heightReport(site, rowHeight), REACH).toBe("ok");
    expect(await readOthers(site)).toEqual(others);

    // Restored means restored: what the site adds afterwards is left alone.
    const later = await appendMail(site, 5);
    await site.waitForTimeout(SETTLE_MS);
    expect(await heightReport(site, rowHeight, (row) => later.includes(row.mail))).toBe("ok");
  });

  // Passes without the whole-list behaviour as well; it's here to hold while that goes in. The settle
  // waits give a list-wide change time to land, and the Keep tests above repeat this check once it has.
  test("the section headers and footers are never restyled", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);

    await panel.getByTestId("preview-layout").click();
    await compactHeight(site, named, rowHeight);
    await site.waitForTimeout(SETTLE_MS);
    expect(await readOthers(site), "in preview").toEqual(others);

    await panel.getByTestId("keep-layout").click();
    await expect(panel.getByTestId("layout-applied")).toBeVisible();
    await site.waitForTimeout(SETTLE_MS);
    expect(await readOthers(site), "after Keep").toEqual(others);

    await appendMail(site, 5);
    await site.waitForTimeout(SETTLE_MS);
    expect(await readOthers(site), "after rows are appended").toEqual(others);

    await panel.getByTestId("restore-layout").click();
    await expect.poll(() => heightReport(site, rowHeight), REACH).toBe("ok");
    expect(await readOthers(site), "after Restore").toEqual(others);
  });
});

// The limit on the above: reaching like items is for style changes. Hiding takes content away, so it
// takes only what was named. This holds today and must still hold once style changes spread.
test("a hide group naming a few rows hides exactly those rows and no others", async ({ context, extensionId }) => {
  const picks = [2, 5, 7];
  const { site, panel, rowHeight, others } = await openWithPlan(context, extensionId, (body, rows) =>
    group(
      "A few rows",
      body,
      rows.filter((node) => picks.includes(Number(node.attrs!["data-mail"]))),
      "hide-secondary"
    )
  );
  const named = (rows: Array<Row>) => rows.filter((row) => picks.includes(row.mail));
  const rest = (rows: Array<Row>) => rows.filter((row) => !picks.includes(row.mail));
  const hiddenRows = async () => {
    const rows = await readRows(site);
    return rows.filter((row) => row.display === "none").map((row) => row.mail);
  };

  // In preview the named rows dim in place; nothing else dims or goes.
  await panel.getByTestId("preview-layout").click();
  await expect.poll(async () => named(await readRows(site)).every((row) => row.opacity < 1), REACH).toBe(true);
  await site.waitForTimeout(SETTLE_MS);
  const inPreview = rest(await readRows(site));
  expect(inPreview.filter((row) => row.opacity < 1 || row.display === "none").map((row) => row.mail)).toEqual([]);

  await panel.getByTestId("keep-layout").click();
  await expect(panel.getByTestId("layout-applied")).toBeVisible();
  await expect.poll(hiddenRows, REACH).toEqual(picks);
  await site.waitForTimeout(SETTLE_MS);
  expect(await hiddenRows()).toEqual(picks);
  expect(await readOthers(site)).toEqual(others);

  // Rows that arrive later aren't named either.
  await appendMail(site, 8);
  await appendMail(site, 4, REST);
  await site.waitForTimeout(SETTLE_MS);
  expect(await hiddenRows()).toEqual(picks);
  expect(await readOthers(site)).toEqual(others);

  await panel.getByTestId("restore-layout").click();
  await expect.poll(hiddenRows, REACH).toEqual([]);
  expect(await heightReport(site, rowHeight)).toBe("ok");
});

// Items of one list can come in several kinds. A change reaches all the kinds, and the next page gets
// the same treatment even if it names fewer of them.
const readSession = (panel: Page, tabId: number) =>
  panel.evaluate(async (key) => {
    const stored = await chrome.storage.session.get(key);
    return stored[key] as TabSession;
  }, `session:${tabId}`);

const onePlan = (body: ScanNode, row: ScanNode): LayoutPlan => ({
  summary: "Inbox",
  template: { urlPattern: URL_PATTERN, pageKind: "inbox" },
  groups: [group("Mail rows", body, [row], "compact")],
});

const namedRows = async (panel: Page, tabId: number) => {
  const session = await readSession(panel, tabId);
  const nodes = session.scan!.nodes;
  const body = nodes.find((node) => node.tag === "tbody" && node.attrs?.id === PRIORITY)!;
  return { session, body, rows: nodes.filter((node) => node.parent === body.id && node.attrs?.["data-mail"] !== undefined) };
};

test.describe("consistent across kinds of item and across visits", () => {
  test("a row of a kind nobody named, with other cells, is compact too", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, others, named } = await openWithCompact(context, extensionId);
    const addVariant = () =>
      site.evaluate(() => {
        const row = document.querySelector("#rows-priority tr.mail")!.cloneNode(true) as HTMLElement;
        row.className = "mail read";
        row.dataset.mail = String(9000 + document.querySelectorAll("tr[data-mail]").length);
        for (let cell = 0; cell < 4; cell++) row.append(document.createElement("td"));
        document.querySelector("#rows-priority tr.list-foot")!.before(row);
        return Number(row.dataset.mail);
      });
    const before = await addVariant();
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);
    const after = await addVariant();

    await expect.poll(() => heightReport(site, compact, (row) => row.mail === before || row.mail === after), REACH).toBe("ok");
    expect(await readOthers(site)).toEqual(others);
  });

  test("items of different tags in one list all change, and a banner in it doesn't", async ({ context, extensionId }) => {
    const { site, panel, tabId } = await openWithPanel(context, extensionId, `${FIXTURE_ORIGIN}/mixed-list.html`);
    const heights = () => site.evaluate(() => [...document.querySelectorAll("[data-card]")].map((card) => card.getBoundingClientRect().height));
    const banner = () => site.locator(".banner").evaluate((element) => element.getBoundingClientRect().height);
    const original = await heights();
    const bannerHeight = await banner();

    const read = panel.getByRole("button", { name: "Read this page" });
    const screenshot = panel.getByTestId("screenshot");
    await expect(read.or(screenshot).first()).toBeVisible();
    if (await read.isVisible()) await read.click({ timeout: 2000 }).catch(() => {});
    await expect(screenshot).toBeVisible();
    const session = await readSession(panel, tabId);
    const nodes = session.scan!.nodes;
    const feed = nodes.find((node) => node.attrs?.id === "feed")!;
    // Only articles and sections are named: the asides are a kind this plan never saw.
    const cards = nodes.filter((node) => node.parent === feed.id && (node.tag === "article" || node.tag === "section")).slice(0, 4);
    expect(cards.length).toBe(4);
    const plan: LayoutPlan = {
      summary: "Feed",
      template: { urlPattern: `${new URL(FIXTURE_ORIGIN).host}/mixed-list.html`, pageKind: "feed" },
      groups: [{ ...group("Feed items", feed, cards, "compact"), urlPattern: `${new URL(FIXTURE_ORIGIN).host}/mixed-list.html` }],
    };
    await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(plan, session.scan!, false, Date.now()));
    await panel.getByRole("button", { name: "Rescan" }).click();
    await expect(panel.getByTestId("plan-reused")).toBeVisible();
    await keep(panel);

    const unchanged = async () => {
      const now = await heights();
      return now.filter((height, at) => height >= original[at] - 2).length;
    };
    await expect.poll(unchanged, { ...REACH, message: "cards left at their original height" }).toBe(0);
    expect(await banner()).toBe(bannerHeight);
  });

  test("a plan naming one row still reaches the list, because the list was remembered", async ({ context, extensionId }) => {
    const { site, panel, rowHeight, named } = await openWithCompact(context, extensionId);
    await keep(panel);
    const compact = await compactHeight(site, named, rowHeight);
    await expect.poll(() => panel.evaluate(async () => {
      const stored = await chrome.storage.local.get("itemShapes");
      return Object.keys(stored.itemShapes ?? {}).length;
    }), REACH).toBe(1);

    const tabId = await panel.evaluate(() => Number(new URLSearchParams(location.search).get("tabId")));
    const { session, body, rows } = await namedRows(panel, tabId);
    await panel.evaluate((entry) => chrome.storage.local.set({ savedPlans: [entry] }), savePlan(onePlan(body, rows[0]), session.scan!, false, Date.now()));
    await site.reload();
    await panel.getByRole("button", { name: "Rescan" }).click();
    await expect(panel.getByTestId("layout-applied")).toBeVisible(REACH);

    await expect.poll(() => heightReport(site, compact, (row) => row.section === PRIORITY), REACH).toBe("ok");
  });

  test("without that memory, one named row shows no list and stays alone", async ({ context, extensionId }) => {
    const { site, panel, rowHeight } = await openWithPlan(context, extensionId, (body, rows) => group("Mail rows", body, rows.slice(0, 1), "compact"));
    await keep(panel);
    await expect.poll(() => readRows(site).then((rows) => rows[0].height), REACH).toBeLessThan(rowHeight - 4);
    const rows = await readRows(site);
    expect(rows[1].height).toBe(rowHeight);
  });
});
