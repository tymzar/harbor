# Hackathon research and scoring strategy

Research date: 27 October 2026. This is a planning artifact, not evidence of a working extension or a submitted entry.

## Evidence and authority

The participant guide supplied in the objective file is the source for the detailed rules and scoring below. The public [organizer event page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) independently confirms the themes, Meta tooling, tracks, and November 4, 9 PM ET submission deadline. It still links to an application waiver; its readable text does not expose the full participant guide. The [waiver link](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) returned no substantive readable rules through the research tool. Therefore detailed guide requirements are **user-provided event evidence**, not independently authenticated official-rule text. Check the accepted-participant rules before submission; do not replace the guide with older third-party summaries.

The public event lists judging November 4–8, while the supplied guide says November 5–8. This does not change the submission deadline. Use the supplied guide's October 27–November 4 building period conservatively. On November 4, Eastern Time is EST: 21:00 EST = November 5 at 02:00 UTC = November 5 at 03:00 Europe/Zurich. Internal submission target: November 4 at 18:00 Zurich, leaving nine hours for upload/access problems.

## Eligibility gates before optimizing score

| Gate from supplied participant guide | Planned evidence / action | Current status |
|---|---|---|
| Incorporate Meta models meaningfully | A recorded live page-map → Meta proposal → validated configuration trace; exact provider/model ID and redacted usage metadata | Planned; no API call made in this planning session |
| Fit a problem statement | Recommend Build for Your World: make frequently used, crowded work sites easier to navigate | Recommendation; track remains provisional |
| Public repository | Public source, install instructions, license inventory, secrets scan, clean release | Not published or changed by this task |
| New event work clearly identified | Baseline commit, new-work changelog, highlighted extension/compiler/validation diff | Existing foundation predates event |
| Maximum four participants, one representative | Confirm accepted team roster, appropriate Indie/Startup track, representative | User/organizer facts still needed before submission |
| Three-minute demo and accessible links | Video, captions, working installable demo, logged-out access check | Future build deliverables |
| Rights and platform compliance | Owned demo fixtures, licensed dependencies, no private workspaces in public footage | Planned |
| Avoid banned/generic projects | Demonstrate a functioning adaptive interface, not a generic chatbot or standalone screenshot analyzer | Designed into product scope |

Do not publish or submit on the user's behalf as part of this planning task. The supplied guide expressly permits startups to build on existing products when new contributions are clear. It does not clearly establish whether that exception also covers Indie entries. Confirm the actual track and reuse boundary with the organizers before submission; do not assume either permission or ineligibility. If reuse is disallowed for the chosen track, build the new extension with an event-created minimal preference implementation and retain this repository only as disclosed background/reference, subject to organizer guidance. Git inspection shows the current head `e97c307` dated October 23 and earlier adaptive app commits October 22–23. Preserve this baseline; CSS inference and the local ranker cannot be presented as invented during the hackathon. The new contribution is discovering and safely configuring previously uninstrumented pages, plus the extension lifecycle and user experience.

## Score model and the evidence that can earn it

The guide assigns 30% Impact, 25% Meta AI Tooling, 20% Technical Depth & Execution, and 25% Demo. Weighted score is `0.30I + 0.25M + 0.20T + 0.25D`, each component 0–10. A one-point improvement changes the total by its weight; there is no basis for predicting judges' actual scores.

| Criterion | Product decision | Concrete evidence to build | Common failure |
|---|---|---|---|
| Impact, 30% | Start with people repeatedly finding actions across crowded documentation, issue lists, and work dashboards | Counterbalanced task sessions: completion time, wrong clicks, recovery, subjective control | Attractive before/after with no task improvement |
| Meta, 25% | Use Meta to infer coherent regions, action semantics, protected sequences, and a configuration; repair once using validator feedback | Show actual structured request/result and a new page not in the adapter code; compare against heuristics | Model only writes marketing copy or explains a prebuilt layout |
| Technical, 20% | Typed configuration, local policy compiler, reversible transactions, stale-page invalidation, stable learning | Fault injection, keyboard tests, failed proposal rejection, restore under DOM mutation | Raw model-generated JS/CSS applied to arbitrary sites |
| Demo, 25% | Explain one painful task and show discovery, proposal, effect, learning, and recovery | Three-minute coherent story, live extension on distinct page structures, visible undo | Long architecture lecture, many half-working bonus features |

Recommended effort split after access/setup: roughly one quarter on discovery and configuration, one quarter on safe execution/recovery, one quarter on UX and real task evaluation, and one quarter on integration and demo. This is a planning heuristic, not an inference about the exact scoring curve. Every core feature must improve at least one scored outcome without weakening the demo.

## Meta integration: facts versus decisions

[Meta's model documentation](https://dev.meta.ai/docs/models) lists `muse-spark-1.3` with multimodal inputs and structured output. Use that exact standard-mode ID as the initial candidate; account entitlement and practical latency remain untested. Standard mode is documented as not using content for training; this is **not** a promise of zero retention. Do not enable contributor mode for webpage content. Wonder is an optional experiment for complex plans; SAM/Image/Voice are not prerequisites. Extra model count earns no demonstrated value by itself.

[Structured output documentation](https://dev.meta.ai/docs/structured-output) specifies Chat Completions `response_format.type = "json_schema"`; explicitly set `json_schema.strict = true`, require every property, and set `additionalProperties: false` on objects. Shape conformance does not prove that a target exists or a proposed transformation is safe. Keep local semantic validation mandatory.

The [API overview](https://dev.meta.ai/docs/overview) documents `https://api.meta.ai/v1` and bearer authentication. Plan a small authenticated proxy that owns the provider key. The extension uploads a minimized page map only after user review. No browser bundle contains the provider secret. No deployment, key setup, credit claim, or paid inference was performed here.

[Current pricing](https://dev.meta.ai/docs/pricing-rate-limits): Spark standard input $1.25 and output $4.25 per million tokens. A hypothetical 8,000-input/2,000-output call costs `$0.010 + $0.0085 = $0.0185`; 500 such calls cost $9.25, before retries or other usage. These are estimates, not measurements. Use actual usage accounting and reserve worst-case output cost before dispatch. Proposed project cap: $100 with a separate $20 demo reserve, below the guide's $150 participant credits if granted. Billing notifications are not an application-enforced hard stop. Do not assume partner credits or any credits are already active.

Open-weight bonus is optional: the guide specifies Baseten `meta-models/muse-spark-open-1026`. Treat provider access, schema support, rates, and exact behavior as a separate integration spike; do not infer compatibility from the hosted Meta API. Choose this route only if it passes the same benchmark and does not endanger the main submission. Best Agentic Use-Case can be supported by the bounded propose → validate → repair loop, but award eligibility and outcome are organizer decisions. Avoid adding image generation solely to chase a creative prize.

## Browser constraints that determine architecture

| Primary source | Verified fact | Our design implication |
|---|---|---|
| [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) | Toolbar invocation grants temporary main-origin access; restricted browser pages are excluded | On each new origin require toolbar invocation, or a separately requested optional site grant |
| [GoogleChrome side-panel guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/chrome-extensions/references/extensions/side-panel.md) | Clicking a side-panel control does not itself activate activeTab | Panel detects lost access and explains how to authorize the current tab |
| [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | Persistent extension UI can coexist with the current page; programmatic opening requires a user gesture | Open on toolbar click, bind all operations to explicit tab/document identity |
| [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Isolated script worlds can read/change DOM and message the extension | Bundle extractor and executor, keep page content untrusted; isolation is not secrecy for shared DOM |
| [Remote-hosted code rules](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) | MV3 requires executable JS/WASM to be packaged; JSON/CSS are not classified the same way | Choose bounded JSON operations and a bundled compiler anyway; arbitrary remote CSS remains an application risk |
| [W3C meaningful sequence](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence) and [focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) | Content and focus sequences must preserve meaning/operation | No generic CSS-only reorder of interactive controls; do not infer accessibility from appearance |

## Research questions with decisive experiments

1. **Does Meta generalize beyond templates?** Hold out entire sites, compare heuristics to DOM-only and DOM-plus-image proposals, measure safe useful coverage and correction rate.
2. **Does configuration save time?** Test original, manual/static adaptation, and learned adaptation on counterbalanced tasks. Count failures and recovery time, not only successful fast trials.
3. **Can reflow preserve app behavior?** Exercise live framework lists, selection, menus, keyboard order and undo. Unknown structures fall back to a labeled focus/jump aid; count them as unsupported for reflow coverage.
4. **Can personal learning help without moving targets?** Freeze during pointer/focus/selection/scroll activity, adapt at explicit boundaries, compare with static order and pin-only baselines.
5. **Does CSS inference add product value?** Run reference parity and frame latency in extension context. Keep JS reference fallback; present CSS as inherited technology rather than the new entry's sole innovation.
6. **Will users permit the data flow?** Test comprehension of the upload preview and deletion controls; measure abandonment. Screenshot redaction is a separate risk, not solved by removing input values from DOM JSON.

No human study, extension browser run, live provider call, or benchmark was conducted during this research stage. Proposed acceptance gates are specified in the implementation plan and must be measured during the build.
