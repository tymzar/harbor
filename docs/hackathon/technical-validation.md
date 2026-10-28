# Smart Web / Astra technical validation

27 October 2026 · Independent planning review using the inherited session model; no GPT-5.6 selection, delegated agents, paid inference, deployment, or implementation changes.

Reviewed `astra-product-ideas.md`, `astra-ux-ideas.md`, `system-plan.md`, `research-and-scoring.md`, and subsequently `ux-spec.md`. **The system plan and selected UX specification are authoritative.** Findings below distinguish unresolved implementation gates from incorrect claims; missing proposed implementation is not described as an existing extension vulnerability. This report is the only file changed by this review. Other working-tree changes were left untouched.

## Decision

**Conditionally feasible for a constrained Chrome extension; not validated for arbitrary-page transformation.** The selected scope—bounded density, order-preserving grid reflow, emphasis, and separately labeled destination ranking—is credible. Generic structural reordering should remain excluded. Most privacy and semantic constraints are correctly recognized, but execution ownership, catalog identity, CSS placement and restoration timing need explicit decisions before implementation.

One factual correction is definite: **closed shadow roots are not inherently inaccessible to Chrome extensions.** Chrome documents `chrome.dom.openOrClosedShadowRoot(element)`. Keep them outside MVP support, but describe that as a scope choice rather than a browser prohibition.

Evidence labels:

- **D — documentary fact:** independently read in primary browser, framework, standards, provider or organizer documentation linked below.
- **C — code inspection:** observed in current source; no execution implied.
- **H — untested hypothesis:** proposed runtime behavior or failure scenario requiring an extension/browser experiment.

No extension browser run, application test suite, model request, accessibility session or performance benchmark was executed. Existing reports and source comments are historical evidence, not fresh results. Source file line numbers refer to the inspection snapshot and may move during parallel work.

Severity: **High** blocks the affected feature or claimed safety property; **Medium** requires correction or a bounded design decision before release. No demonstrated deployed critical vulnerability was found or claimed.

## Findings and required corrections

### TV-01 · High — Reflow eligibility cannot be certified from a semantic graph

**Targets:** system plan lines 113–125; product ideas' P0 in-place operation and Oct 30 gate; selected UX lines 11–12 and 73.

**D:** React warns that changing its managed children can cause inconsistent results or crashes. W3C requires logical focus order preserving meaning and operation; visual and focus order need not be literally identical in every valid layout. Sources: [React DOM manipulation](https://react.dev/learn/manipulating-the-dom-with-refs), [W3C Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).

**C:** `src/app/adaptive.ts:49` offers a generic array reorder helper, not a third-party DOM adapter. Its surrounding category/evidence logic uses the Harbor catalog. `src/app/hold.ts:3` explicitly excludes keyboard and touch holds.

**Required correction:** Make the selected scope explicit in the implementation gate: no `appendChild`/reparenting, cloning live controls, positive-tabindex repair, CSS `order`, or dense grid placement to implement generic ranking. Use bounded style changes preserving source order. Structural reorder remains adapter-specific future work. Define eligibility per operation, including descendant controls, overflow, sticky elements and responsive behavior; an LLM category such as “independent cards” is insufficient. Label stricter visual/source-order alignment as a product policy, not a universal WCAG requirement.

**H / gate:** Test native activation, focus, selection, reading order and host rerender after each supported operation on two page families and a held-out page. Geometry checks alone cannot prove semantic safety. A shortcut-only fallback remains useful but does not pass the selected in-page-layout goal. The product ideation fallback is now an alternative, not the acceptance contract.

### TV-02 · High — Preview expiry can itself move an actively used target

**Targets:** selected UX lines 14–15, 23, 28, 43 and 83; system plan lines 125–127 and 135.

The synthesis resolves the old conflict: live preview preserves website operation and freezes learning; it does not blanket-block site controls. A remaining tension is unconditional expiry/cleanup versus “never move a target during protected interaction.” Restoring grid width or spacing while a pointer is pressed can move the target just as applying it can.

**D:** Logical focus and operability remain required during dynamic changes. [W3C Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).

**Required correction:** Specify `preview → expired-pending-restore → restored/partial` transitions. Expiry immediately disables Apply and learning; geometry restoration waits for a safe interaction boundary. Explicit Cancel has defined priority and preserves the current reachable focus/selection where possible. Capture focus ownership at entry, but do not steal focus back to a stale trigger after the user deliberately moves elsewhere. Escape must be scoped so that closing a website menu/dialog does not also unexpectedly cancel preview.

**H / gate:** Hold pointer-down across expiry, select text during preview, focus a link then cancel, close the panel, and remove a target before expiry. Content-side timers and messages are best-effort while documents are suspended; promise cleanup on resume/reattach, not an exact wall-clock deadline under every browser lifecycle. Website actions performed during preview are not reversible by layout undo.

### TV-03 · High — CSS inference is not currently isolated, and a shadow wrapper is insufficient

**Target:** system plan line 141; CSS reuse claims in both ideation documents.

**C:** `src/cssnet/index.ts:78` derives the host document, then appends style sheets to `doc.head` at lines 100, 105, 111 and 137. `src/cssnet/generate.ts:34` shares `--cn-*` property names across instances. Selectors use a module-local `cn1`, `cn2` sequence. Moving only the computing elements into a shadow tree leaves their styling outside that tree. `src/app/cssnetBridge.ts:121` falls back on a mount exception; the initial zero-weight probe is not continuous protection against later interference.

**D:** Isolated-world JavaScript does not create a separate DOM. Chrome's CSS scoping article describes document-level `@property` semantics and implementation discrepancies in shadow trees; its implementation observations are historical, not proof of today's installed browser behavior. Sources: [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [CSS names and shadow DOM](https://developer.chrome.com/docs/css-ui/css-names).

**Required correction:** Replace “isolated subtree” with a named execution surface. Prefer JS inference initially; if CSS is retained, place it in an extension document such as the panel, with JS available after the panel closes. Alternatively budget an explicit shadow-scoped stylesheet/property refactor and accept that shared-page CSS is not a security boundary. Document separately the content-script script CSP, extension-document CSP, and the stylesheet insertion mechanism. Do not claim either that page CSP always blocks extension styling or that isolated execution exempts every DOM style insertion.

**H / gate:** Test restrictive `style-src`, hostile resets/animations/custom properties, two injected instances, panel closure, and nonzero randomized weights against the JS reference. Validate outputs before using them and disable CSS on mismatch. Existing `MODE_NOTES` timings and parity figures do not establish extension performance or isolation.

### TV-04 · High — MV3 request lifecycle and learning ownership remain underspecified

**Targets:** system plan lines 53, 127, 147 and 151; worker reuse assumptions.

**D:** Chrome normally terminates an idle service worker after 30 seconds, a single operation after five minutes, or when a fetch response takes over 30 seconds to arrive. Global state is lost. [Service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

**C:** `src/model/client.ts:8` uses an in-memory pending-request map and `new Worker(...)` at line 44: a dedicated Web Worker, not an MV3 background worker. Constructor fallback does not handle a later worker error or indefinitely unanswered message. `src/model/protocol.ts:7` and the client still use fixed `CardId`/`Category` types. `src/model/persist.ts` schedules writes and logs save errors; it is not a durable request journal or affirmative save acknowledgment.

**Required correction:** Name the owner of ranker state, event sequencing, persistence and rollback. Keep DOM handles/rollback in the content script; persist model state and acknowledged revisions through a new extension storage adapter. Do not reuse the fixed worker protocol unchanged. The proposed 30-second proxy deadline leaves no margin against the documented fetch boundary: use a shorter bounded synchronous deadline, or a promptly acknowledged server job with authenticated status retrieval. Server-side deduplication must associate user, request ID and payload hash; a client-generated idempotency key alone does not prevent a second paid dispatch.

**H / gate:** Terminate the worker during dispatch and save, reconnect the panel, close it while learning, then retry. Require no duplicate model job, no stale apply, truthful save status and a defined policy for interrupted local events. Persisted markers cannot restore live nodes after navigation or restart.

### TV-05 · High — Catalog persistence needs ordered semantic identity, not shape or set equality

**Targets:** system plan lines 131 and 139; generic ranker reuse.

**C:** `src/model/ranker.ts:296` persists weights but no ordered catalog mapping. `validateFor` at line 336 checks dimensions and optionally compares sorted item sets. Even when `orders` exists, catalog `[A,B]` versus `[B,A]` can pass while weight rows and affinity counts refer to different items. With `orders = null`, a different same-size catalog can pass. The comment at line 330 claiming validation of the exact catalog overstates the implementation. `CatalogIndex` checks duplicate item IDs but not duplicate group IDs or empty groups; `step` resolves item and group separately without asserting membership.

**Required correction:** Store ordered group IDs, ordered item IDs with membership, feature schema, model schema and an identity fingerprint. Separate session DOM IDs from persistent semantic IDs. Reordering the same identities also needs migration: output rows/biases, affinity counts, group-context input columns, group counts and saved orders must align. For the MVP, reset on any nonidentical ordered mapping rather than partially migrate neural state. Reject empty/duplicate groups, invalid item/group pairs, out-of-bounds dimensions and malformed normalization arrays before training or load. Do not normalize arrays to comma-joined strings for identity comparison.

**H / gate:** Same-length replacement, reordered items, reordered groups, moved membership, duplicate labels, navigation and account switch must never inherit another identity's preference silently. This is a code-derived failure analysis, not an executed regression result. The system plan already identifies same-size replacement; extend it to permutations and group-input identity.

### TV-06 · High — The existing signal collector violates the proposed minimal-input contract if reused wholesale

**Targets:** system plan lines 62, 133 and 137; selected UX learning and privacy behavior.

**C:** `src/signals/extractor.ts` globally collects pointer trajectories, timing and `KeyboardEvent.key` through `attachDomListeners`; `targetKeyOf` depends on app-specific `data-testid` values. No `isTrusted` guard appears in that listener path. This does not establish that full typed text is retained or transmitted, but it does establish broader input observation than the selected activation-only design. The generic ranker still expects the pointer/time feature shape.

**Required correction:** Build a narrow event adapter for validated catalog activations and explicit feedback. Do not attach the inherited global collector by default. Use keyboard-native activation without counting keydown and click twice; reject synthetic activation as positive evidence. Define neutral feature values or a versioned simpler feature schema when pointer collection is disabled. Scope event resolution to the current node registry and permitted composed event path; learning must stop during preview and Pause. `isTrusted` is an input filter, not proof of intent or a complete defense against a deceptive page.

**H / gate:** Keyboard Enter/Space, pointer activation, nested targets, synthetic `.click()`, preview and pause should produce exactly the intended observation counts without reading typed values. Compare affinity-only and blended ranking before claiming the MLP helps.

### TV-07 · Medium — Specify complete permissions and reacquisition behavior

**Targets:** system plan activation/backend architecture; research browser constraints; selected UX Ready/returning paths.

**D:** `activeTab` grants temporary access after qualifying extension invocation, survives same-origin navigation, and is revoked on cross-origin navigation. `scripting` is also required for programmatic injection. A side-panel button can satisfy `sidePanel.open()`'s gesture rule without itself being a documented `activeTab` invocation. Extension-context cross-origin fetch uses host permissions; content-script fetch remains subject to the page origin's network restrictions. Sources: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

**Required correction:** Record the initial manifest permissions as `activeTab`, `scripting`, `sidePanel`, `storage`, plus narrowly scoped backend host access. Do not add broad website permissions to fix backend fetch. Use toolbar activation for new page access; opening or revisiting the panel is not equivalent. Keep cross-origin frames opaque initially. Permission surviving same-origin navigation does not preserve content-script instances or node handles: reattach/revalidate per document. Choose a tested minimum Chrome version (programmatic panel opening requires Chrome 116+).

Illustrative call, not executed: `chrome.scripting.executeScript({target: {tabId, frameIds: [0]}, files: ['content.js'], world: 'ISOLATED'})`. `frameIds: [0]` limits baseline injection to the main frame; packaged code and `ISOLATED` avoid relying on host JavaScript variables. Permission and eligible URL checks remain necessary.

**H / gate:** Toolbar activation, panel-only interaction on another tab, same-origin navigation, cross-origin navigation, permission revocation and a store/internal page must produce distinct truthful states.

### TV-08 · High — Authorization must bind trusted UI consent to an exact payload

**Targets:** system plan lines 74, 76, 145 and 149–151; selected UX data review.

**D:** Chrome advises scrutinizing even internal extension messages because content scripts may be compromised. `storage.local` is accessible to content scripts by default; its access level can be restricted. Sources: [extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure), [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).

**Required correction:** Authorize remote dispatch from trusted extension UI against a bounded, immutable payload snapshot/hash, tab/document identity and request ID. Derive sender context from browser-supplied `MessageSender`, not fields supplied inside a message. Revalidate freshness and exact payload on dispatch; changed labels or task text require renewed review. Restrict auth/session storage to trusted contexts, e.g. `chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'})`, and return only scoped data to content scripts. Keep endpoints fixed; never provide a general privileged fetch relay. Define size, rate and operation limits on every message boundary.

**H / gate:** Forged tab IDs, stale consent, substituted payloads, malicious labels and replayed dispatch must be rejected before provider access. Local schema validation prevents executable operations only if the compiler has no escape hatch; it cannot prove that arbitrary page text is nonsensitive.

### TV-09 · Medium — Closed-shadow limitation is factually overstated

**Target:** system plan compatibility row at line 162, “Closed shadow root / canvas UI — No internal DOM discovery.” The older UX proposal is more accurate in calling this a conservative exclusion.

**D:** Chrome exposes `chrome.dom.openOrClosedShadowRoot(element)` in extensions, documented from Chrome 88. [Chrome DOM API](https://developer.chrome.com/docs/extensions/reference/api/dom).

**Required correction:** Split the row: “Closed shadow root: excluded from MVP traversal and mutation; Chrome-specific inspection is possible but unvalidated.” Keep canvas-only semantics a separate limitation. Ordinary `element.shadowRoot` returning null does not establish extension-level impossibility.

**H / optional upgrade:** Deliberate traversal through the extension API could broaden discovery later; it does not establish safe styling, event behavior or accessible semantics. No expansion is needed for the selected MVP.

### TV-10 · Medium — Model facts check out; live access and schema acceptance remain gates

**Target:** research “Meta integration,” system plan setup/contract/schedule.

**D:** Official docs currently list `muse-spark-1.3`, the `https://api.meta.ai/v1` base URL, bearer authentication and structured output. The quoted standard token prices ($1.25 input / $4.25 output per million) and $0.0185 example arithmetic are consistent. Standard mode's no-training statement is not zero retention. Sources: [models](https://dev.meta.ai/docs/models), [overview](https://dev.meta.ai/docs/overview), [pricing](https://dev.meta.ai/docs/pricing-rate-limits).

**D:** For Chat Completions use `response_format: {type: 'json_schema', json_schema: {name, strict: true, schema}}`. Strict mode defaults false; every object requires `additionalProperties: false` and all properties listed in `required`. Root unions, `oneOf` and `allOf` are unsupported in the strict subset; nested `anyOf` is supported. [Structured output](https://dev.meta.ai/docs/structured-output).

**Required correction:** Retain the model as a documented candidate, not a working integration. Compile the operation union to the provider's actual subset; do not assume a generated discriminated-union schema is accepted. Validate completion/truncation/error status before parsing and revalidate semantic IDs locally. Document credentials, entitlement, credits, provider retention terms and actual output budget as unresolved setup gates. Do not silently switch to Contributor mode or a different provider. Treat the Baseten bonus model ID as guide-provided until independently checked against that provider.

**H / deferred authorized build gate:** A real minimal request must establish account access, accepted schema, usable output, latency and usage accounting. No request was made here. The Oct 27 live-call milestone is future build work and cannot be marked passed from this report.

### TV-11 · Medium — Selected defaults are resolved, but system-plan wording should match

**Targets:** system plan lines 135 and 137; selected UX lines 10, 25, 77 and 81.

The selected UX resolves the earlier annotation/live-preview, blocked-controls, login and saving conflicts. Do not report those alternatives as unresolved requirements. Remaining wording: the system plan describes automatic changes and five observations/30-second thresholds without explicitly making that mode later work, while the selected UX makes queued review the default and automation a later opt-in. The system plan's Undo paragraph distinguishes learning deletion but omits the selected UX's suppression of the rejected suggestion for the visit.

**Required correction:** Add “MVP queues all learned changes for explicit review; automatic thresholds are later experimental policy.” Add session-scoped rejection suppression to Undo without deleting unrelated model history. Apply the interaction guard to initial Apply, preview toggling and rollback too, not just automatic updates. Preserve TV-02's explicit expiry-versus-interaction policy. These are contract clarifications, not evidence of an implementation defect.

## Confirmed documentary claims and boundaries

- MV3 remote-hosted-code restrictions cover executable JavaScript/WASM; Chrome explicitly distinguishes JSON and CSS. The bounded JSON compiler is a good design, but this distinction is not blanket store approval for arbitrary remote styling. [Chrome remote-hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).
- The organizer page confirms Meta tooling and the November 4, 9 PM Eastern deadline. Detailed scoring weights, credit entitlement, team acceptance and bonus identifiers remain supplied-guide claims in this review. The research document correctly avoids representing them all as independently authenticated. [Organizer page](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon).
- The repository is a Vite/React application with reusable ranker math and CSS experiments. Inspected `package.json` has app build/test scripts; the targeted source inventory found no extension manifest or provider integration. This is scoped negative evidence, not a claim about every ignored or external file. Generic ranking exists in `ranker.ts`; fixed app transport and persistence are separate reuse constraints.
- No source establishes universal DOM safety, screen-reader compatibility, automatic account separation, model generalization, latency targets or user benefit. Those remain hypotheses even where the architecture is sensible.

## Minimum evidence before claiming the selected slice works

| Gate | Required evidence | Current status |
|---|---|---|
| Permission lifecycle | Unpacked extension on fresh profile; allowed/restricted pages, navigation and panel-tab switching | Not run |
| Safe page change | Order-preserving density/grid/emphasis; original actions and manual keyboard/screen-reader checks | Not run |
| Preview recovery | Expiry during interaction, panel closure, host mutation, stale responses, partial rollback | Not run |
| Identity and local learning | Ordered-catalog mismatch tests, neutral features, trusted native activation, pause/preview exclusion | Code risks identified; tests not run |
| Worker and backend resilience | Worker termination, idempotent dispatch, durable acknowledgment, authenticated payload binding | Not implemented/validated by this review |
| CSS reuse | CSP/collision/parity matrix on target Chrome; JS fallback with truthful diagnostics | Existing app evidence only |
| Meta integration | Authorized minimal strict-schema call with exact provider/model and redacted usage metadata | Documentation checked; no API call |
| Product impact | Original/static/learned task comparison with failures and setup cost reported | No study performed |

Proceed with planning and a constrained implementation after incorporating these corrections. Do not make CSS inference, generic node reordering, screenshot upload or optional provider integration prerequisites for the first demonstrable page transformation.

## Resolution audit — revised system plan and selected UX specification

27 October 2026 · Reread both revised documents after incorporation of TV-01–TV-11. This is a document-level resolution audit, with no renewed web research, code execution, provider calls or implementation verification. The original findings above remain the historical review; their planning status is superseded by this section.

**Result: all eleven findings are addressed as planning decisions. No remaining high-severity planning contradiction was identified in these two documents.** This closes the identified specification gaps, not the runtime acceptance gates.

| Findings | Addressed planning decision | Pending implementation experiment |
|---|---|---|
| TV-01 | Source-order-preserving operations; explicit generic reorder prohibitions; operation-specific eligibility. Both documents now require accepted, locally learned change on the actual page. | Host rerenders, original controls, semantic/reading order, overflow and held-out page compatibility. |
| TV-02, TV-11 | Queued review is the MVP default; automation deferred; Undo suppresses recurrence. Preview expiry disables Apply/learning and waits for a safe restore boundary; scoped Escape and focus ownership are explicit. Guards also cover initial Apply, toggles and rollback. | Pointer-down/selection/focus across expiry, menu dismissal, suspension/resume, panel closure and partial restoration. |
| TV-03 | Bundled JS first; optional CSS computation in the extension panel; JS continues after panel closure; CSP contexts and parity checks distinguished. | Nonzero parity, CSP/collision cases and truthful fallback if optional CSS is implemented. CSS is not a prerequisite for the initial slice. |
| TV-04 | Content script owns ranker/registry/rollback; background mediates acknowledged revisions. Interrupted events and concurrent-tab conflicts have explicit policies. Synchronous deadline reduced to 20 seconds; server deduplication binds user/request/hash. | Worker termination during dispatch/save, acknowledgment loss, retry without duplicate dispatch, concurrent tabs and reconnect. |
| TV-05 | Ordered semantic identities, membership and feature/model schemas persisted separately from DOM IDs; reset on any mapping change; malformed catalogs rejected. | Same-size replacement, item/group permutations, membership changes, invalid arrays and account/route changes. |
| TV-06 | Fresh activation-only adapter; no inherited global collector; native activation deduplication, synthetic rejection, preview/Pause exclusion and neutral feature policy. | Exactly-once keyboard/pointer observation, no typed-value collection, nested target resolution and affinity/blend comparison. |
| TV-07 | Manifest permissions/backend scope, main-frame isolated injection, Chrome minimum and document reattachment specified; UX requires fresh toolbar access when absent. | Fresh-profile install, restricted pages, tab switching, navigation and revocation. |
| TV-08 | Immutable payload-hash approval in trusted UI, browser-derived sender identity, stale/replayed-consent rejection, restricted storage and bounded fixed-endpoint messages. UX requires renewed review after authentication. | Payload substitution, forged context, stale approval, replay and credential/storage isolation. |
| TV-09 | Closed shadow roots explicitly excluded by choice; Chrome inspection capability distinguished from canvas semantics. | None required to retain the exclusion; traversal/style/event tests only if support is expanded. |
| TV-10 | Strict-subset schema compilation and completion/truncation checks specified; live schema smoke test and account/credit setup remain future gates. | Authorized model call proving entitlement, schema acceptance, status handling, latency and usage accounting. |

Two low-severity wording cleanups remain; the surrounding detailed rules already establish the intended behavior:

- In the system plan's execution contract, replace “Cancel always removes it” with “Cancel requests guarded restoration; report pending or partial restoration.” This avoids implying immediate or guaranteed total removal despite the subsequent lease and partial-rollback rules.
- In the UX failure table, split “Model timeout, quota or auth failure” into the distinct Sign in / quota explanation / retry paths already specified under Good paths. The existing combined Retry wording should not override that more precise rule.

Implementation must also honor the selected unchecked **Remember on this device** choice when wiring acknowledged checkpoints: use visit-scoped state until saving is authorized. The documents specify both persistence machinery and user-controlled saving; this is an integration check, not evidence of a remaining high-severity contradiction.

All runtime gates in the preceding evidence table remain pending. The revised documents are sufficient to proceed with the constrained implementation and its planned experiments; they do not establish that the extension, model integration or safety properties already work.
