# Region-level fingerprints for saved layouts

Agent B, 31 October 2026. Branch `worktree-agent-a1a950887a08da04e`.
Code: `extension/src/shared/region.ts`, `extension/src/shared/cache.ts` (`savePlan`, `remapPlan`, `remapRegions`).
Evaluation: `extension/eval/fingerprint/` (`npm run eval:region`).

## Summary

A saved layout now remembers each group as a **region**: the shape of its subtree, the shape of its
rows, where it sits among the page's landmarks and headings, its coarse geometry, and the links and
words inside it. The current element signature (tag, kind, attributes, link, digit-free text) is
still saved and still one signal among several. On the next visit the saved landmark/heading
skeleton is aligned to the new scan first, then every group is scored against every element, and
each group gets a confidence band: applied silently, applied and named in the panel, skipped and
named, or reported lost.

On 20 real page snapshots changed in 13 ways (4,914 changed groups), the element matcher in use
today found 84% of groups correctly, matched 99 to the wrong element and lost 700. The region
matcher found 98.5% correctly, matched 3 to the wrong element and lost 69. On the half of the sites
not used for tuning the picture is the same (98% correct, 0% wrong, rounded). On the three owned
fixtures, changed in a real browser and read by the real scanner, it went from 77% to 94% correct
(351 changed groups), with 1 wrong match against the baseline's 0.

**Recommendation:** merge it. Then add the re-ask step for lost groups (designed below, not built),
and measure on real revisits of real sites before tightening or loosening the thresholds.

## The problem

Node IDs (`n12`) only mean something within one scan. A saved plan therefore stores a
`NodeSignature` per container and per member, and `locateNodes` finds each again: same tag and
kind, then points for each attribute, the link and the digit-free text that are *exactly* equal;
position only breaks ties, or identifies an element with no content at the same place. Whole
lists are found again as "the container's children with this tag and kind". A group whose
container isn't found is dropped silently.

That is precise when nothing changed, and brittle when anything did:

- **Copy edits and translation** change the text, and `aria-label` is text too. A container whose
  only identity was its text is lost (31% of groups survive a translated page).
- **An extra wrapper** between a list and its rows means the container has no children of the
  saved shape: the whole list is lost, even though the container itself was found.
- **Equal-scoring elements** are common (nested wrappers share their first 80 characters of
  text, sibling rows share a styling `data-*` attribute), and the first one in document order wins:
  2–4% of groups are matched to the wrong element under almost every change, and 2% even on an
  unchanged page.
- **Nothing reports what happened**: lost groups vanish from the plan, and a mismatched hide hides
  the wrong thing without a word.

## Research

What the literature offers, and what was taken from each.

| Idea | Source | Used here |
|---|---|---|
| Tree edit distance; RTED computes it in O(n³) worst case with an input-dependent decomposition strategy | Pawlik & Augsten, *RTED: A Robust Algorithm for the Tree Edit Distance*, VLDB 2012 ([arXiv](https://arxiv.org/abs/1201.0230)); *Efficient Computation of the Tree Edit Distance*, TODS 2015 ([abstract](https://dbresearch.uni-salzburg.at/publications/2015tods-efficient-computation-ted/abstract)) | **Not used directly.** Exact TED between every saved region and every candidate subtree is too slow to run on every scan in a content script. A bag of parent→child shape tokens (below) is a cheap, order-free proxy for the same question, "how much of this subtree's structure is still there". |
| Simple Tree Matching: the maximum matching of two ordered trees without crossing levels, used to compare data records | Yang, *Identifying syntactic differences between two programs*, SP&E 21(7) 1991 ([record](https://scholar.nycu.edu.tw/en/publications/identifying-syntactic-differences-between-two-programs/)); used in DEPTA: Zhai & Liu, *Web Data Extraction Based on Partial Tree Alignment*, WWW 2005 ([PDF](https://archives.iw3c2.org/www2005/proceedings/docs/p76.pdf)) | The **row shape** check: a list's rows are found as children whose subtree shape matches the saved row's (Dice ≥ 0.6), not only by tag. DEPTA's "align only what aligns with certainty, leave the rest" became the policy for members: match on identity while the region still has identity; fall back to position only when it has lost it as a whole. |
| Data records are repeated, similar subtrees under one parent ("generalized nodes") | Liu, Grossman & Zhai, *Mining Data Records in Web Pages* (MDR), KDD 2003 ([DBLP](https://dblp.uni-trier.de/rec/conf/kdd/LiuGZ03.html)) | Whole-list groups are fingerprinted by the shape of their rows; the list is "the container's current rows of that shape", which survives rows being added, removed, or wrapped. |
| Wrapper induction by comparing pages of one site: a template with iterators and optionals | Crescenzi, Mecca & Merialdo, *RoadRunner*, VLDB 2001 ([BibTeX](https://bibtex.github.io/VLDB-2001-MeccaCM.html)) | Shape tokens are a **set**, not a sequence, so an iterator (a list of 3 or 30 rows) has the same fingerprint; an optional block (an ad slot) adds a few tokens without removing any. |
| Page segmentation by visual blocks and separators | Cai, Yu, Wen & Ma, *VIPS*, MSR-TR-2003-79 ([PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/tr-2003-79.pdf)) | **Coarse geometry** (box in viewport widths) is one signal, deliberately weighted low: the evaluation shows position is the least stable feature (inserts, reorders, viewport). Harbor's groups already come segmented by Spark (and optionally SAM), so VIPS itself isn't rerun. |
| Template detection: page parts that recur across a site's pages are "template" | Bar-Yossef & Rajagopalan, *Template Detection via Data Mining*, WWW 2002 ([paper](https://archives.iw3c2.org/www2002/CDROM/refereed/579)) | The **page skeleton** (landmarks and headings) is treated as the stable template the regions hang off; it is aligned first and regions are placed relative to it. |
| ARIA landmarks: banner, navigation, main, complementary, contentinfo, labelled when repeated | W3C APG, *Landmark Regions* ([w3.org](https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/)) | Skeleton keys are tag + role + `aria-label` for landmarks and digit-free text for headings. |
| Multi-locators and similarity-based element localisation for test repair | Leotta et al., ICST 2015 ([PDF](https://sepl.dibris.unige.it/publications/2015-leotta-ICST.pdf)); Nass et al., *Similo*, TOSEM 2023 ([arXiv](https://arxiv.org/abs/2208.00677)) | Context only: this is the element-level line of work (the other agent's approach). Two lessons carried over: combine many weak signals with weights instead of one exact key, and an attribute only identifies an element if it is unique among its peers. |

Not used: Diffbot-style visual/ML page classification (needs a trained model and a server);
full XPath/CSS locators (classes aren't scanned, and they churn).

## Design

### What is saved (per group)

`RegionPrint` in `region.ts`, stored in `SavedPlan.regions`, aligned with `plan.groups`:

| Field | What | Why |
|---|---|---|
| `shape` | Hashed `tag.kind` and `parent>child` tokens of the container's subtree, 3 levels, breadth first, at most 64 | Structure without text, classes or counts. Compared with the Dice coefficient. A wrapper adds two tokens; a redesign replaces most. |
| `row` | The same, over the first five rows (whole-list groups only) | Finds rows by what they look like when a wrapper or a tag change gets in the way. |
| `within`, `after` | Skeleton index of the nearest landmark around the container, and of the last landmark or heading before it | "The list after the *Latest* heading inside *main*." Survives reordering and inserted blocks. |
| `words` | Up to 12 digit-free words of the container text | Weak text signal; still counts when a few words change. |
| `marks` | Hashed `href` and attribute values inside the region (not `aria-label`) | Links and data attributes usually survive translation and copy edits. |
| `box` | Container box in viewport widths | Tie-breaker; proportional, so a narrower window keeps it. |
| `plain`, `common` | Which identity features didn't tell the container apart when saved: text it shares with its parent or first child (scanned text is the first 80 characters of everything inside), attributes, link or text it shares with a same-kind sibling | Such features are dropped from the identity score; they were the main source of the baseline's wrong matches. |
| `members` | For item-by-item groups, per member: shape, child-index path from the container, box relative to the container, number of same-kind siblings, `plain`/`common` | Members are searched only inside the matched container. |

Per plan, `SavedPlan.page` (`PagePrint`) holds the skeleton (landmark and heading keys in document
order), its hash, and a hash of the page's distinct `parent>child` shapes. Element signatures and
`rows` are saved as before.

### How a saved plan is matched (`remapRegions`)

1. **Align the skeleton.** Longest common subsequence of saved and current anchor keys; anchors
   left between two matched ones are paired in order by tag and role (reworded or translated
   headings). If fewer than 30% of labelled anchors kept their exact key, the page is treated as
   *another language*: text, words and `aria-label` stop counting, for and against.
2. **Score every element for every group container**, a weighted mean of the components present:
   tag/kind (1), subtree shape (3), row shape (2), element identity — attributes, link, text, minus
   `plain`/`common` (3), marks (2), words (1.5), place among aligned anchors (2), geometry (1).
3. **Confidence** = best score, less a penalty when another region (not an ancestor or descendant
   of the best) scores within 0.1. A region with nothing but shape to go on (no identity, no words,
   no marks: an empty box) is capped at its geometry score, as the element matcher already
   requires "same place" for such nodes.
4. **One region per element**, strongest groups first. Groups sharing a container share the match.
   Among the best candidate's ancestors and descendants scoring within 0.05 of it (nested wrappers
   that read the same), the one whose box is closest to the saved box wins.
5. **Members.** Whole lists: the container's children of the row shape; if fewer than two, the
   nearest wrapper level (breadth first, covering ≥ 60% of the container) that holds rows.
   Item-by-item: candidates only inside the container. A member with an identity must match on it
   while the group's other members, or the region's links (or words, for text-only members), still
   do — tabs don't swap, and a removed row doesn't become its neighbour. Without identity a member
   is matched by shape, path and relative position, and only if its list still has as many items.
6. **Band** per group (next section). Only `same` and `moved` groups go into the plan; it still has
   to pass `validatePlan`.

### Degradation policy

Thresholds were set on the tuning half of the snapshot sites from the calibration table below
(every match the matcher would make, by confidence).

| Band | Rule | What Harbor does | Measured (all snapshot runs) |
|---|---|---|---|
| `same` | confidence ≥ 0.75 and geometry ≥ 0.8 | Apply silently. | 4,456 groups, 100% correct (3 wrong) |
| `moved` | ≥ 0.60, or ≥ 0.70 for `hide-secondary` | Apply, and list the group in the panel: "Found after the page changed: …". | 651 groups, 100% correct (rounded) |
| `skipped` | ≥ 0.45 but below the apply threshold | Don't apply; panel: "Not applied, not sure it's the same: …". Candidate for re-asking. | 69 groups; 75% would have been right, 25% wrong |
| `lost` | < 0.45, no members left, or not found | Don't apply; panel: "No longer on this page: …". Re-ask Spark for these groups only. | 116 groups; 53% were really gone, 32% would have been wrong if applied |

Hiding needs more certainty than compacting or emphasising, because hiding the wrong thing is the
worst outcome (content disappears); a mis-placed emphasis is visible and harmless.

**Re-asking Spark for only the missing groups** (designed, not built; no Meta call was made). When
a reused plan has `skipped` or `lost` groups and the user presses "Fix missing" (never
automatically: it sends page content to Meta):

- Prompt: the same system prompt, and `describePage(scan)` as today, plus a section
  `Groups saved for this page that can't be found now:` with one line per group:
  `label | role | operation | reason | what it was: <tag.kind> "<saved text>" near "<heading before it>" at [x,y,w,h]`.
  Instruction: *"Find each of these groups on the current page. Return a group only for those you
  find, with the same label, role and operation; omit any that are no longer on the page. Return
  no other groups and no questions."*
- Same JSON schema; the answer is validated with `validatePlan` as usual, merged into the reused
  plan by label, and the plan is saved again (new fingerprints). The token cost is the page
  description plus a few lines, and the output is small.

### Page-changed detector

`pageChanged(saved.page, pagePrint(scan))` compares two hashes, computed in the same pass as the
scan's index: the **skeleton** hash (landmarks and headings, digit-free) and the **structure**
hash (the set of distinct `parent>child` tag.kind pairs, so list lengths and text don't change it).
Either one differing means the plan's groups are re-verified and reported (the panel lines above);
both equal means nothing structural changed and the `same` path is expected.

Measured on the snapshots (per page, after each change): unchanged page 0% flagged; counters 0%;
class or id churn 0% (they don't change the scan's structure); wrapper 98% (structure);
inserted block 95% (structure); reorder 58% (skeleton order); copy edits 65%; translation 95%
(skeleton); list growth 32% and shrinking 15–17% (content headings change); redesign 100%. In
the current code the region matcher runs on every reuse anyway (2 ms), so the detector decides
what the panel says, not whether matching happens; on a large saved-plan list it could also gate
the full match.

### Backwards compatibility

- Plans saved before this change have no `regions`; `remapPlan` matches them element by element
  exactly as before (`remapNodes`, unchanged code). When such a plan is reused on its own page and
  every group is found, `reusePlan` re-saves it with fingerprints in place (keeping answers).
- New plans keep `signatures` and `rows`, so an older build reading them still works.
- `remapPlan(saved, scan)` keeps its signature; `remapRegions(saved, scan)` returns the plan plus
  the per-group report and the detector result. `Proposal.reused.drift` carries moved/skipped/lost
  labels to the panel (`data-testid="plan-drift"`).

## Evaluation

### Method

No network, no Meta calls. Two harnesses, both in `extension/eval/fingerprint/`:

1. **Snapshots** (`snapshots.eval.test.ts`, `mutate.ts`). The 20 scans in
   `evaluation/snapshots/*/scan.json` (third-party pages; local only, not committed). Each scan is
   rebuilt as a tree, changed, and flattened with fresh IDs in document order, as `scanPage`
   numbers them; every surviving node remembers which saved node it was.
2. **Fixtures, real DOM** (`fixtures.eval.test.ts`, `dom-mutate.ts`, `scan-entry.ts`). The three
   owned pages in `extension/fixtures/` are opened from disk in Playwright's Chromium, changed in the
   DOM, and read with the extension's own `scanPage` (bundled with esbuild). Ground truth travels on
   the elements as JS properties (not attributes, so the scanner can't see it). Viewport is a real
   1280→1024 px resize; class renames rewrite the stylesheet too, as a build would.

**Plans.** Spark plans from earlier runs reference live scans whose IDs don't line up with the
snapshots, so plans were synthesised from each scan (seeded): up to 3 whole lists (≥ 3 same-shape
children, grid/compact), 2 single rows of a list (hide), 2 landmark regions (hide), 1 element picked
by the user (hide). 126 groups on the snapshots, 9 on the fixtures.

**Changes**, 3 seeds each:

| Change | Snapshot model | Real DOM |
|---|---|---|
| none | control | control |
| class-hash | classes aren't scanned; styled-component `data-*` values regenerated, `data-v-xxxx` added | every class renamed in DOM and CSS |
| id-churn | `id` and digit-carrying `data-*` values regenerated | every `id` regenerated (CSS updated) |
| wrapper | a `div` around a region (with a badge so it is scanned) or between a list and its rows | same, layout copied onto inner wrappers |
| insert | a 90 px "Sponsored" block before 1–3 regions, content below pushed down | same |
| reorder | two stacked sibling sections swap places and positions | swap of DOM siblings |
| text-counters | every number changes | same |
| text-copy | a third of innermost texts get a word changed, propagated to ancestors' text | a third of text nodes |
| text-translate | every word and `aria-label` mapped to another word (consistent page-wide) | text nodes, `aria-label`, `alt`, `title` |
| viewport | 1280→1024: x and widths × 0.8, y × 1.15, blocks taller | real resize |
| list-grow / list-shrink | 1–3 rows cloned with new text and links / up to 40% of rows removed | same |
| redesign | one saved region replaced by a different structure with new content | same |
| ab-variant | wrapper + insert + copy + id churn at once | same |

**Judging** each group after each change: **correct** if every applied member is the element it
was (or a wrapper standing exactly in its place, or a new row of the same list), and the container
is the same element or one just around/inside it that holds all members; **wrong** if anything
else was applied (for a hide: the wrong thing disappears); **none** if the group wasn't applied.
When the group's region is really gone (redesigned, or its one row removed), **none is correct**
and anything applied is wrong. Both matchers are judged by the same code. "Region" is the matcher
with the band policy applied; "ungated" is every match it would make, ignoring bands.

**Tuning split.** Weights and thresholds were tuned by looking at failures on the even-numbered
sites (alphabetical); the odd-numbered 10 were not inspected and are reported separately.

### Results: 20 snapshots (scan-level changes)

5,292 group runs; 4,914 with a change.

| Change | Baseline correct | Baseline wrong | Baseline none | Region correct | Region wrong | Region none |
|---|---|---|---|---|---|---|
| none | 98% | 2% | 0% | 100% | 0% | 0% |
| class-hash | 97% | 3% | 0% | 99% | 0% | 1% |
| id-churn | 97% | 2% | 2% | 99% | 0% | 1% |
| wrapper | 84% | 2% | 14% | 100% | 0% | 0% |
| insert (ad/promo) | 90% | 2% | 7% | 100% | 0% | 0% |
| reorder | 93% | 3% | 4% | 100% | 0% | 0% |
| text-counters | 98% | 2% | 0% | 100% | 0% | 0% |
| text-copy | 72% | 0% | 28% | 98% | 0% | 2% |
| text-translate | 31% | 0% | 69% | 98% | 0% | 2% |
| viewport (modelled) | 87% | 4% | 9% | 97% | 0% | 3% |
| list-grow | 98% | 2% | 0% | 99% | 0% | 1% |
| list-shrink | 98% | 2% | 0% | 99% | 1% | 0% |
| redesign (one region) | 97% | 3% | 0% | 100% | 0% | 0% |
| ab-variant (combined) | 47% | 2% | 52% | 92% | 0% | 8% |
| **all** | **85%** | **2%** | **13%** | **99%** | **0%** | **1%** |

Absolute, over the 4,914 changed groups: baseline 4,115 correct / **99 wrong** / 700 none;
region 4,842 correct / **3 wrong** / 69 none. Held-out sites only (2,856 runs): baseline 85% / 2% /
13%, region 98% / 0% / 1%; per change within 3 points of the table above (largest gaps: text-copy
97%, viewport 96%, ab-variant 89% correct). Full tables in `extension/eval/fingerprint/results-snapshots.md`.

**Regions that were really gone** (redesigned, or the one row a group hid was removed): 118 such
groups; the baseline applied 6 of them anyway (to something else), the region matcher 2. Without the
band policy ("ungated") the region matcher would have applied 12% of redesign runs wrongly: the
bands are what keep a redesign from being mis-matched.

Calibration (every match the region matcher would make, held-out sites):

| Confidence | Matched | Correct | Wrong |
|---|---|---|---|
| < 0.5 | 23 | 0 | 23 |
| 0.5–0.6 | 13 | 6 | 7 |
| 0.6–0.7 | 33 | 32 | 1 |
| 0.7–0.8 | 143 | 142 | 1 |
| 0.8–0.9 | 95 | 95 | 0 |
| 0.9–1.0 | 2,499 | 2,497 | 2 |

### Results: 3 owned fixtures (real DOM, real scanner)

378 group runs; 351 with a change. Small: 9 groups, so one group is 11 points of a row.

| Change | Baseline correct | Baseline wrong | Baseline none | Region correct | Region wrong | Region none |
|---|---|---|---|---|---|---|
| none | 100% | 0% | 0% | 100% | 0% | 0% |
| class-hash (real CSS rename) | 100% | 0% | 0% | 100% | 0% | 0% |
| id-churn | 100% | 0% | 0% | 100% | 0% | 0% |
| wrapper | 85% | 0% | 15% | 100% | 0% | 0% |
| insert | 93% | 0% | 7% | 89% | 0% | 11% |
| reorder | 85% | 0% | 15% | 81% | 4% | 15% |
| text-counters | 89% | 0% | 11% | 100% | 0% | 0% |
| text-copy | 22% | 0% | 78% | 89% | 0% | 11% |
| text-translate | 11% | 0% | 89% | 89% | 0% | 11% |
| viewport (real 1024 px) | 100% | 0% | 0% | 100% | 0% | 0% |
| list-grow | 93% | 0% | 7% | 100% | 0% | 0% |
| list-shrink | 85% | 0% | 15% | 100% | 0% | 0% |
| redesign | 100% | 0% | 0% | 100% | 0% | 0% |
| ab-variant | 33% | 0% | 67% | 70% | 0% | 30% |
| **all** | **78%** | **0%** | **22%** | **94%** | **0%** (1 run) | **6%** |

Absolute: baseline 269 correct / 0 wrong / 82 none; region 329 correct / **1 wrong** / 21 none.

### Failure cases

- **Reorder between look-alike sidebars (fixtures, the 1 wrong).** `docs.html` has two narrow
  link columns whose links are all `href="#"`, so links don't tell them apart. When the left nav
  moves to the right, the other column now sits where it was, and words (weight 1.5) only just
  outweigh geometry; in one seed the other column won. Real sites have real links, which is why
  the snapshots don't show it; but it's the pattern to watch: two regions of the same shape and no
  distinguishing content.
- **Empty boxes (all 3 snapshot wrong matches).** A picked element with no text, attributes or
  links (YouTube's `yt-touch-feedback-shape`, an empty Steam media box) is identifiable only by
  shape and place. When it is removed or moved and an element of the same shape now sits where it
  was, that element is taken (YouTube reorder, YouTube and Steam list-shrink). The element matcher
  fails the same way on the reorder. A fix would be to refuse to save a picked group with no
  content at all, or to save its nearest ancestor with content as the anchor.
- **Nested wrappers that read the same.** Scanned text is the first 80 characters of everything
  inside, so a card and its wrapper often have equal text and links. A tie-break picks the
  candidate whose box is closest to the saved one among nested candidates within 0.05 of the best;
  before it was added, 3 Spotify runs hid the wrapper (3,450 px tall) instead of the card.
- **Conservative misses.** Most `none` results are `skipped` hides at confidence 0.6–0.7 (75% of
  `skipped` groups would have been right), and ad blocks inserted right above a small region in the
  fixtures. This is the price of a hide threshold of 0.7; the re-ask step is the way to recover them.
- **Partially translated pages** (labels translated, user content not) keep text identity on
  (fewer than 70% of labels changed), so a text-only member of a list can be reported lost rather
  than found. Seen in the unit-test page, not measured on the snapshots.

### Cost

Measured in the snapshot harness (Node, Apple Silicon, scans of 40–236 nodes, mean 131):

- **CPU**: fingerprinting at save 0.41 ms mean (max 2.1 ms); region matching 2.1 ms per reuse
  (max 4.4 ms) against 0.17 ms for the element matcher. Scans are capped at 600 nodes; the matcher
  is O(groups × nodes) with per-node shapes memoised, so the worst case is about 5× the largest
  measured scan, ~25 ms, once per page visit. Untested at 600 nodes.
- **Storage**: a saved plan grows from 3.3 KB to 6.3 KB mean (max 8.7 KB) for 6–8 groups. At the
  50-plan cap that is about 0.4 MB of `chrome.storage.local` (10 MB quota).

## What is tested and what is assumed

Tested: everything in the tables, on the stated data, with `npm test` (52 unit tests, 8 new for
regions) and `npm run test:e2e` (17 passed, 78 skipped: the specs that need the network or a Meta key
skip themselves, as before this change).

Assumed, not tested:

- The **groups are synthetic**, not Spark's. Spark's containers are sometimes much wider than one
  of these (a whole left menu for one item); those are covered only by the "region" and "picked"
  groups here.
- The snapshot **changes are models** of real changes at scan level. Viewport in particular is a
  linear scaling, not a reflow; the real resize was tested only on the three fixtures (100% both).
  Real redesigns and A/B tests mix changes in ways the generator doesn't.
- The **thresholds** were tuned on 10 sites and checked on 10 others from the same 20; no data from
  real revisits of the same page over days exists yet.
- The scan only covers the viewport. A region scrolled out of view is "lost" for both matchers;
  that is a scanning question, not a matching one, and isn't measured here.
- The panel lines (`plan-drift`) are wired but not covered by an e2e test.

## Recommendation

1. Merge the region matcher behind the existing `remapPlan`: it fixes the two big losses (wrappers,
   text changes) and cuts wrong matches from 99 to 3 of 4,914, while old plans keep working.
2. Keep the conservative hide threshold (0.7) until there is data from real revisits.
3. Next: the re-ask step for `skipped`/`lost` groups (button, not automatic), and logging of bands
   and confidences on real use (locally) to recalibrate.
4. The element-level work (richer per-node features) composes with this: it would improve the
   identity component (weight 3) and the member matching inside a region.

## Running it

```bash
cd extension
npm test                 # unit tests, incl. src/shared/region.test.ts
npm run eval:region      # both harnesses; writes eval/fingerprint/results-*.md (aggregates only)
SNAPSHOTS=/path/to/snapshots npm run eval:region -- snapshots
DEBUG=region DETAIL=1 npm run eval:region -- fixtures      # every non-correct group, with candidates
CASE="github-repo,wrapper,2,List n86" npm run eval:region -- case
```

The snapshot harness skips itself when the snapshots folder is missing. Per-group output names
third-party sites and is only printed, never written.
