# Evaluation set

Real websites, real requests, checkable outcomes. Built 28 October 2026 for the Day 6 evaluation in the [seven-day plan](../docs/hackathon/seven-day-plan.md). No model was called to build it.

| File | What it is |
|---|---|
| `sites.json` | 20 pages: URL, site, page kind; all load in the automated browser |
| `scenarios.json` | 54 scenarios: what the user asks, and what must (and must not) happen |
| `snapshots/<site>/` | What the extension saw: `scan.json`, `meta.json`, `page.jpg`. **Not committed** (third-party content); regenerate with the collector |
| `validation.md` | Last validator report: every anchor checked against the snapshots |
| `validate.ts` | The validator |
| `runs/<run>/` | Results of a scored run: one JSON per scenario and `report.md`. Screenshots in `shots/` are not committed |
| `score.ts` | Turns a run folder into `report.md` |

## Coverage

Collected logged out, from Switzerland, 1280×800, in Playwright's Chromium with the extension's test build. Cookie walls were answered "Reject all" where offered.

| Site | Page | Id | Elements | Cookie wall | Status | Scenarios |
|---|---|---|---|---|---|---|
| YouTube | video feed | `youtube-home` | 40 | Reject all | scanned (history-off page, sparse) | 3 |
| YouTube | video page | `youtube-watch` | 165 | Reject all | scanned | 3 |
| Twitch | stream directory | `twitch-directory` | 209 | – | scanned | 4 |
| Twitch | category streams | `twitch-category` | 198 | – | scanned | 1 |
| GitHub | code repository | `github-repo` | 233 | – | scanned | 4 |
| Stack Overflow | Q&A thread | `stackoverflow-question` | 114 | – | scanned | 4 |
| Wikipedia | encyclopedia article | `wikipedia-article` | 172 | – | scanned | 3 |
| Amazon | product search | `amazon-search` | 179 | – | scanned | 3 |
| MDN | documentation | `mdn-reference` | 112 | – | scanned | 2 |
| BBC News | news front page | `bbc-news` | 88 | banner left open | scanned | 2 |
| LinkedIn | job search | `linkedin-jobs` | 121 | banner left open | scanned (sign-in overlay present) | 1 |
| The Verge | news front page | `theverge-front` | 60 | banner left open | scanned | 2 |
| Spotify | music artist page | `spotify-artist` | 137 | Reject all | scanned | 2 |
| Booking.com | travel search | `booking-search` | 176 | – | partial: no results rendered | 2 |
| Bluesky | social profile | `bluesky-profile` | 139 | – | scanned | 3 |
| DEV Community | community feed | `devto-feed` | 105 | – | scanned | 3 |
| The Guardian | news front page | `guardian-front` | 106 | – | scanned | 3 |
| PyPI | package page | `pypi-package` | 75 | – | scanned | 2 |
| Steam | game store page | `steam-app` | 95 | – | scanned | 4 |
| IKEA | product listing | `ikea-category` | 87 | Reject | scanned | 3 |

**Replaced.** Six sites first chosen refuse automated browsers and were swapped for popular sites of the same kind (28 Oct): X → Bluesky (HTTP error), Reddit → DEV Community (empty page), Hacker News → The Guardian (rate limited), npm → PyPI (Cloudflare check), IMDb → Steam (403), eBay → IKEA (error page). They work in a normal Chrome profile; scenarios for them can be added back with `"requires": "real-browser"` and run by hand.

Scenarios that would hide sign-in walls or cookie prompts are deliberately absent: that is getting around a site's own controls, not personalising its layout. One scenario hides an ad slot (`guardian-hide-ad-and-subs`), as ad blockers commonly do; leave it out if that matters for how results are presented.

## Scenario format

```jsonc
{
  "id": "gh-hide-actions-everywhere",
  "site": "github-repo",                // a sites.json id
  "goal": "…",                          // typed into "I come here to…"; absent for picker scenarios
  "pick": { … },                        // picker scenarios: the element the user clicks
  "tags": ["hide", "duplicate-regions"],
  "requires": "real-browser",           // optional
  "expect": [
    { "op": "hide", "anchor": { "attr": { "data-testid": "repo-header-actions" } } },
    { "op": "keep", "anchor": { "tag": "nav", "attr": { "aria-label": "Repository" } } }
  ]
}
```

An **anchor** names an element the way a person would point at it, and is matched against the scan by `extension/src/shared/anchors.ts` (unit-tested). Fields: `tag`, `kind`, `text` (substring), `textStart`, `href` (substring), `attr` (exact), `area` (viewport position bounds). Text ignores case, whitespace and digits, so counters don't break anchors. A text anchor resolves to the deepest element carrying the text.

Scenario mix: 48 goal scenarios (mainly hide 38, emphasize 7, density/grid 3) and 6 picker scenarios; 16 change more than one region; 1 has the same controls in two places (the GitHub request from 28 Oct, verbatim); 46 include `keep` checks (52 in all) to catch over-hiding. 124 expectations in total: hide 60, keep 52, emphasize 8, compact 3, grid 1.

Every anchor was also checked by eye against what it resolves to, so that a `hide` names the region and not just its heading; where only a heading was available, a second element of the same region is required as well (e.g. Amazon's filter column: "Popular Shopping Ideas" and "Brands").

## Scoring

The runner (`extension/e2e-tests/eval-run.spec.ts`) runs each scenario on the live site: open it the way the collector did, scan, resolve the anchors against *this* scan, then send the goal without and then with the screenshot (same scan), apply every proposed change with the plan's default answers, check each expectation on the page through a read-only content probe (`smartWeb.inspect`), and restore. Picker scenarios hide the picked element instead, with no model call. The untouched page is scored the same way, as the do-nothing baseline.

| Expectation | Passes when |
|---|---|
| `hide` | the anchor element is not visible (`checkVisibility` false) |
| `emphasize`, `compact`, `grid` | the anchor element is inside, or is, an element Smart Web marked with that operation |
| `keep` | the anchor element is still visible and not inside a hidden region |

Not scored: `unresolved` (the anchor names nothing on this visit, the site changed) and `not-visible` (already hidden before any change). A scenario whose page was rescanned mid-run (it navigated) is left out, since element IDs no longer line up.

Report per run:

- **Expectation pass rate**, and per op: hide recall, emphasize/compact/grid accuracy.
- **Over-hiding**: share of `keep` expectations violated. This is the safety number; it should be near zero.
- **Scenario pass rate**: all expectations of a scenario pass.
- **Cost and speed**: Spark and SAM latency, input/output/reasoning tokens, repair rounds, validator rejections.
- **DOM-only vs DOM + SAM**, same scenarios, to answer whether SAM earns its place.

Known judgement calls: for "fit more on screen" (`twitch-dir-dense-grid`) both `compact` and `grid` serve the intent, and for `amazon-grid-results` a `compact` results list is a partial pass. Report these separately rather than forcing one answer.

## Results

Runs on 28–29 Oct 2026, Spark at reasoning effort low. Each `runs/<run>/report.md` has the per-scenario marks. Rounds 2 and 3 changed the extension between runs, so they are before/after comparisons, not repeats.

| Run | What changed before it | Checks passed (structure / + screenshot) | Scenarios fully passed | Nothing extra hidden | Hidden as asked |
|---|---|---|---|---|---|
| do nothing | – | 42–44% | 0–2% | 100% | 0% |
| `2026-10-28-effort-low` | – | 84% / 78% | 64% / 60% | 85% / 80% | 83% / 78% |
| `…-r2` | a hide takes only the named items unless they are all of the region | 87% / 89% | 71% / 76% | 100% / 100% | 73% / 78% |
| `…-r3` | the region goes when the named items are most of it; checks count emptied wrappers as hidden | **93% / 93%** | **84% / 84%** | **100% / 100%** | **87% / 87%** |
| `2026-10-29-effort-low-dom` | redraw re-apply and learning added; DOM only, regression check | 93% / – | 83% / – | 100% / – | 86% / – |

Each run: about 136–141 Spark calls (≈830k input, ≈285k output tokens of which ≈210k reasoning), 176–180 SAM calls, 9–13 minutes with three workers. Half the plans needed one repair round. The screenshot (SAM) made no consistent difference across the three runs.

Denominators differ between runs because sites change: scenarios whose elements were not on the page that visit (a bot check, a different page) are not scored. In round 3: PyPI served a 9-element check page, BBC's top story and LinkedIn's upsells were absent, and Stack Overflow rewrote its URL mid-run.

## Running

```bash
cd extension
E2E=1 npm run build
COLLECT=1 npx playwright test eval-collect --workers=1    # refresh snapshots (visits the 20 sites)
COLLECT=1 SITES=github-repo,youtube-watch npx playwright test eval-collect --workers=1
cd .. && node evaluation/validate.ts                      # every anchor must resolve

# Scored run: real Meta calls through the local proxy (proxy/README.md must be running)
cd extension
EVAL=1 npx playwright test eval-run --workers=3                      # → evaluation/runs/<date>-effort-low/
EVAL=1 SCENARIOS=gh-hide-actions-everywhere MODES=dom-only npx playwright test eval-run
cd .. && node evaluation/score.ts <date>-effort-low                  # → runs/<run>/report.md
```

`EVAL_RUN` names the run folder. A goal scenario in both modes took about 40 s and three Spark calls (one was a repair round), about 33k input and 7k output tokens, in a smoke test on 28 Oct. The proxy keeps no spend records (no database), so cost is reported in tokens.

Use one worker: parallel visits got a site (Hacker News, since replaced) to rate-limit the run. Sites change; re-collect and re-validate before an evaluation run, and fix anchors the validator flags.

## Limits

- Logged out only. Logged-in pages (your GitHub, your YouTube home) differ in structure; the logged-in GitHub top bar is a known gap.
- The scan covers the visible viewport, so every anchor is above the fold at 1280×800.
- One locale (Switzerland, English). Consent flows and some content differ elsewhere.
- Expected outcomes were written by one person from the scans and screenshots; they are a reasonable reading of each request, not ground truth agreed by several annotators.
