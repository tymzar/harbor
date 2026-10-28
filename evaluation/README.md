# Evaluation set

Real websites, real requests, checkable outcomes. Built 28 October 2026 for the Day 6 evaluation in the [seven-day plan](../docs/hackathon/seven-day-plan.md). No model was called to build it.

| File | What it is |
|---|---|
| `sites.json` | 20 pages: URL, site, page kind; all load in the automated browser |
| `scenarios.json` | 54 scenarios: what the user asks, and what must (and must not) happen |
| `snapshots/<site>/` | What the extension saw: `scan.json`, `meta.json`, `page.jpg`. **Not committed** (third-party content); regenerate with the collector |
| `validation.md` | Last validator report: every anchor checked against the snapshots |
| `validate.ts` | The validator |

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

Run each scenario: scan, send the goal (no screenshot, then with screenshot), apply every proposed change, then check each expectation on the live page.

| Expectation | Passes when |
|---|---|
| `hide` | the anchor element is not visible (`checkVisibility` false) |
| `emphasize`, `compact`, `grid` | the anchor element is inside, or is, an element Smart Web marked with that operation |
| `keep` | the anchor element is still visible and not inside a hidden region |

Report per run:

- **Expectation pass rate**, and per op: hide recall, emphasize/compact/grid accuracy.
- **Over-hiding**: share of `keep` expectations violated. This is the safety number; it should be near zero.
- **Scenario pass rate**: all expectations of a scenario pass.
- **Cost and speed**: Spark and SAM latency, input/output/reasoning tokens, repair rounds, validator rejections.
- **DOM-only vs DOM + SAM**, same scenarios, to answer whether SAM earns its place.

Known judgement calls: for "fit more on screen" (`twitch-dir-dense-grid`) both `compact` and `grid` serve the intent, and for `amazon-grid-results` a `compact` results list is a partial pass. Report these separately rather than forcing one answer.

## Running

```bash
cd extension
E2E=1 npm run build
COLLECT=1 npx playwright test eval-collect --workers=1    # refresh snapshots (visits the 20 sites)
COLLECT=1 SITES=github-repo,youtube-watch npx playwright test eval-collect --workers=1
cd .. && node evaluation/validate.ts                      # every anchor must resolve
```

Use one worker: parallel visits got a site (Hacker News, since replaced) to rate-limit the run. Sites change; re-collect and re-validate before an evaluation run, and fix anchors the validator flags.

## Limits

- Logged out only. Logged-in pages (your GitHub, your YouTube home) differ in structure; the logged-in GitHub top bar is a known gap.
- The scan covers the visible viewport, so every anchor is above the fold at 1280×800.
- One locale (Switzerland, English). Consent flows and some content differ elsewhere.
- Expected outcomes were written by one person from the scans and screenshots; they are a reasonable reading of each request, not ground truth agreed by several annotators.
