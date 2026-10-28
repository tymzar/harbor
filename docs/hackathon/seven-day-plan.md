# Seven-day build plan

Build days are **Tue 28 Oct → Mon 3 Nov**. **Tue 4 Nov is buffer only**: re-record, fix a blocker, submit by **18:00 Zurich** (hard deadline Wed 5 Nov 03:00 Zurich = 4 Nov 21:00 ET). This plan supersedes the pacing in [implementation-backlog.md](implementation-backlog.md); the tickets' contracts still apply, at hackathon depth rather than production hardening.

Verified starting point (see [API probe](api-probe-2026-10-27.md)): key works; Muse Spark 1.3 strict JSON works directly and via LiteLLM; SAM 3.1 finds UI elements by visual phrases (`button`, `icon`, `rounded rectangle`, `gray box`), not UI names (`card`, `menu`).

## The pipeline being built

```
toolbar click
  → content script: DOM scan (visible area) + chrome.tabs.captureVisibleTab
  → user reviews what will be sent (DOM summary; screenshot is a separate toggle)
  → local LiteLLM proxy (key + budget) 
      → SAM 3.1 × 3–4 shape prompts, in parallel   → boxes
  → hit-test boxes to DOM elements (elementsFromPoint) → visual groups
      → Muse Spark 1.3, strict schema: name groups, propose operations
  → local validator (known IDs, allowed ops, protected regions)
  → preview on the real page → apply → restore
  → local learning: clicks rank items → queued suggestion → accepted → page changes
```

## Today, Mon 27 Oct (evening, 30 min)

- [ ] Email organizers: track (Indie/Startup) and whether pre-event code (ranker, CSS inference) may be reused.
- [ ] Commit `HACKATHON_PLAN.md`, `docs/hackathon/`, `FEEDBACK.md`, `.gitignore` as the dated baseline. Leave `reports/` changes and `template-finances.zip` out.

## Day 1 — Tue 28 Oct · Extension shell and proxy

- MV3 extension as a separate Vite entry (`extension/`): manifest with `activeTab`, `scripting`, `sidePanel`, `storage`; toolbar opens side panel; content script injected on click.
- LiteLLM proxy locally (`litellm --config proxy.yaml`): `meta/muse-spark-1.3`, a virtual key for the extension, `max_budget` set. SAM via proxy passthrough if it works in 30 min, otherwise a 20-line direct route in the same proxy process.
- DOM scan: visible elements with stable transient IDs, bounding boxes, role/tag/text snippet; skip inputs, password fields, iframes.
- Two owned fixtures in `extension/fixtures/`: a docs page and a product catalog, plain HTML with no special markup.

**Exit check:** click toolbar on a fixture → side panel lists scanned elements and shows the screenshot thumbnail.

## Day 2 — Wed 29 Oct · SAM → DOM → Spark → validator

- SAM: 3–4 parallel prompts per screenshot; parse `<|box;…|>` tokens; scale to CSS pixels via `devicePixelRatio`.
- Box → DOM: `elementsFromPoint` at box centre and corners, climb to the smallest ancestor covering the box; dedupe.
- Spark: one strict-schema call with DOM summary + visual groups; operations limited to `compact`, `grid`, `emphasize`, `hide-secondary`, `none`. Try `reasoning_effort: low` vs default; keep the faster one if plans are equal.
- Validator: rejects unknown IDs, protected elements (forms, nav landmarks unless user-allowed), oversized plans, stale page revision. One repair retry with validator errors.
- Review screen in side panel: what is sent, screenshot toggle, Send button.

**Exit check:** real, validated plan for both fixtures, logged with model ID, latency, tokens.

## Day 3 — Thu 30 Oct · Real page changes · **first checkpoint**

- Executor: CSS-only, order-preserving changes via injected stylesheet + data attributes on owned elements; every mutation recorded for restore.
- Preview (outline overlay → live preview) → Apply → Restore. Escape cancels. Re-scan on large DOM mutation.
- Original links and keyboard tab order still work after apply.

**Exit check (the core demo):** fixture → scan → SAM+Spark plan → preview → apply → click an original link → restore. Record a rough screen capture as insurance.

## Day 4 — Fri 31 Oct · Real websites and the second page family

- Run on 4–6 real sites across docs / catalog / dashboard. Fix the top failures only.
- Unsupported states shown honestly in the panel (restricted pages, canvas, cross-origin iframes).
- Per-site memory: approved layout re-applies on revisit (opt-in toggle).
- Pick the two demo sites.

**Exit check:** works end-to-end on two real sites from different families.

## Day 5 — Sat 1 Nov · Learning that changes the page

- Activation adapter: count real (`isTrusted`) clicks/keypresses on items in Spark-named groups.
- Reuse `src/model/ranker.ts` for per-site item ranking (credited as pre-event code).
- Queued suggestion ("Move *Pricing* up in this group?") → accept → executor applies an order change within that group → restore works. Pins override ranking; pause toggle.

**Exit check:** use a demo site for a few clicks → suggestion appears → accepted → visible change on the actual page.

## Day 6 — Sun 2 Nov · Evidence and feature freeze

- Comparison on 8–10 pages not used during development: DOM-only Spark vs DOM+SAM Spark vs plain heuristic. Count: valid plans, groups that match a hand label, broken pages. Small table with denominators.
- Fix blockers found by the comparison. **Feature freeze at end of day.**
- README: install (unpacked), proxy setup, what's new vs reused, limitations.

**Exit check:** results table in `docs/hackathon/results.md`; clean unpacked install in a fresh Chrome profile.

## Day 7 — Mon 3 Nov · Demo and submission package

- Script and record the 3-minute video: crowded page → scan → SAM masks overlay → Spark plan → apply → learned change → second site → restore/failure case.
- 15-second viral clip (mask overlay + page rearranging) and X post draft.
- Draft every form field: track, problem statement, description, Meta usage, why Meta matters (cite the SAM comparison), feedback (from `FEEDBACK.md`), partner tech.
- Repo public-readiness: secrets scan, `.env*` absent from history, license, remove stray files.

**Exit check:** video uploaded (unlisted), form fields drafted, repo ready to flip public.

## Buffer — Tue 4 Nov

Re-record or fix one blocker only. Publish repo, post X clip, submit by 18:00 Zurich.

## If a day slips

Cut in this order, never the core loop:

1. Per-site memory on revisit (Day 4)
2. `hide-secondary` operation
3. Third page family / extra real sites
4. Learning reorder → fall back to learned *emphasis* (still a real page change)
5. Comparison size: 8–10 pages → 5

Daily habits: add to `FEEDBACK.md` when Meta tooling surprises you; log every live call (model, latency, tokens) to `evidence/`; commit at each exit check.
