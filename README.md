# Harbor

**A calm place on a busy web.** Harbor is a Chrome side-panel extension that reshapes any web page around
how you use it. Meta's **Muse Spark** reads the page and proposes a layout from your own preferences;
nothing on the page changes until you preview it and press **Keep**. What you keep comes back by itself
on every page of that kind, and an on-device model learns which items you open and offers to put them
in your order.

Built for the Meta AI Developer Hackathon (27 Oct – 4 Nov 2026).

## What it does

1. **Set up your harbor (15 seconds, once).** Three picks: the page shape you'd rather read (roomy or
   compact, list or grid), what you reach for first (search or the content), and what to tidy (ads,
   pop-ups, "more like this", sidebar extras, comments: keep, fold or clear). Ads and promo pop-ups start
   cleared. Your picks are sent with every request as short rules; anything left "as is" is never sent.
2. **Read → Suggest → Preview → Keep.** Click Harbor's toolbar icon. Muse Spark (optionally with SAM 3.1
   on a screenshot) proposes changes: hide, fold behind a "Show …" button, compact, grid, emphasise. Each
   change says why ("because your harbor: ads cleared", or "Muse Spark's own idea: …"). Preview outlines
   them on the real page; untick anything; Keep.
3. **It stays.** A kept layout is saved per change and re-applied, with no Meta call, wherever its
   regions are found again. Matching is by structure, not URL: every saved layout on a site is tried on
   every page of that site, and a region whose fingerprint is re-found with high confidence is applied
   there, so a change to the top bar follows you from the feed to a messaging thread. On a site you
   follow, a page of a new kind gets a Muse Spark suggestion by itself (at most once per page shape per
   day; a switch in Settings turns it off), drafted around what is already on the page. A style change
   on a repeated list (compact, grid) reaches every like item, including rows below the fold, rows added
   later and kinds the plan didn't name; what the items look like is remembered per site. Hide, fold and
   order act only on what the plan names.
4. **It learns your order (on this device, opt-in).** Harbor checks which regions the page lays out as one
   row of like items (a nav bar, tabs) and marks them "learns your order". After 8 clicks in such a row,
   the on-device network's ranking is offered as a whole order, e.g. *Messaging · Jobs · Home*.

**Never touched:** cookie, consent and sign-in prompts (you answer those yourself), a page's main video,
and forms you are filling in. Form contents are never read or sent.

## Meta models

| Model | Used for |
|---|---|
| **Muse Spark 1.3** (`meta/muse-spark-1.3`) | Reads the page's element list (tags, positions, short text) plus your harbor's rules, returns a layout plan as strict JSON (`json_schema`); one repair round if the plan fails validation |
| **SAM 3.1** (`meta/sam-3.1`) | Optional: segments the screenshot into regions that look alike, which are matched to page elements and given to Spark as visual groups |

Both are called through a local LiteLLM proxy, so the Meta key never enters the extension.

## Install from scratch

Requirements: Chrome 121+, Node 22.18+, Python 3.10+, a Meta Model API key.

```console
git clone <this repo> harbor && cd harbor

# 1. Keys (git-ignored). The proxy key is any random string; the build embeds it, never the Meta key.
cat > .env.local <<'EOF'
META_API_KEY=<your Meta Model API key>
SMART_WEB_PROXY_KEY=<any random string>
EOF

# 2. The local model proxy on 127.0.0.1:4000 (keep it running)
python3 -m venv .venv && .venv/bin/pip install -r proxy/requirements.txt
LITELLM=.venv/bin/litellm proxy/run.sh

# 3. The extension (second terminal)
cd extension && npm install && npm run build
```

Load it: `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/build/`.
Pin Harbor, open a normal website, click the icon. The first open shows the three-pick setup (or
"Skip setup" for Harbor's defaults).

Chrome only lets Harbor read a page after you click its icon (`activeTab`). To have kept layouts come
back on every page of a site without clicking, switch on **Follow me on <site>** at the bottom of the
panel; Chrome asks you once, for that one site. On a tab Harbor can't read yet, the panel offers the same
for all sites (**Allow on all sites**). From then on, any tab that loads an allowed site where you saved a
layout is read as it loads, with the panel closed too: what you kept is on the page in a new tab and after
a restart. A site with nothing saved still waits for your click.

## Tests

```console
cd extension
npm test            # 85 unit tests (Vitest)
npm run test:e2e    # 39 browser tests (Playwright, real Chrome with the extension, owned fixture pages)
npm run lint && npm run typecheck
npm run eval:region # fingerprint benchmark on fixtures (and on local snapshots if collected)
```

Run `npm run test:e2e` rather than Playwright directly: it makes the test build first.

## What was built during the event, and what was reused

Organizers confirmed on 29 Oct that pre-event code may be reused if credited.

- **Before the event (22–23 Oct, 33 commits up to `e97c307`):** the Harbor app in the repo root (`src/`):
  the generic on-device ranker (`src/model/`), the 52-feature pointer-signal extractor (`src/signals/`)
  and the CSS-computed adaptive UI. The extension reuses the ranker, the affinity counter and the signal
  features for its learning.
- **Template:** `extension/` started from [starter-web-extension@ed1112d](https://github.com/tymzar/starter-web-extension),
  imported unmodified in `9e48354`.
- **During the event (27 Oct – 4 Nov, everything after that):** the whole extension: page scanning,
  the Muse Spark and SAM 3.1 integration and proxy, plan schema and validation, the executor (hide, fold,
  compact, grid, emphasise, order), preview/keep/restore, saved layouts and region-level fingerprints, the
  onboarding and profile rules, structure-based matching across a site, automatic suggestions on new
  page kinds, learning in the extension, the order check and suggestions, the evaluation harness, and
  the report in `report/`.

Internal identifiers (`smart-web` folder, `data-smart-web-*` attributes) keep the project's working name.

## Limits, stated plainly

- Tested on owned fixture pages with Playwright and by hand on live sites; live third-party sites change
  without notice, and a saved layout can miss a region (the panel says which).
- Reordering is visual only (CSS `order`): keyboard Tab order and screen readers keep the site's order.
  It only works where the page lays items out as one row; elsewhere Harbor emphasises instead.
- A frame of the site's own that fills the window is read in place of the empty shell around it
  (LinkedIn's messaging pages); other iframes and shadow DOM aren't read. Chrome pages and the Web
  Store can't be changed.

## Repository

```
extension/   the Chrome extension (MV3, React 19, HeroUI v3, Tailwind 4, esbuild)
proxy/       LiteLLM config for the Meta Model API
report/      technical report (main.pdf)
docs/        design notes: fingerprinting, hackathon planning and validation
evaluation/  scenario definitions and scoring for live-site runs (snapshots stay local)
evidence/    raw outputs of live runs
src/         the pre-event Harbor app whose model the extension reuses
e2e/         browser tests for the pre-event app
reports/     pre-event blog post, persona sessions and screenshots
research/    pre-event experiments on computing in CSS
```
