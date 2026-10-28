# Smart Web: independent product, UX and judging validation

27 October 2026. Desk research and source inspection using the inherited default model; no model switch or agents spawned. Sole owned deliverable: this report. No human participants, application runs, provider calls or implementation tests were performed. Recommendations and acceptance targets below are proposed, not achieved results.

## Verdict and authority

**Proceed with the full page-understanding → model-configuration → smart-page-layout vision, subject to measurable delivery gates.** The strongest differentiated hypothesis is that a person can adapt an unfamiliar working page through a grounded, understandable configuration, retain its original functionality, and refine that layout through local preferences. A sidebar destination list alone cannot validate that hypothesis. A successful constrained demonstration also cannot validate arbitrary-site coverage or long-term demand.

Reviewed [product ideas](astra-product-ideas.md), [UX ideas](astra-ux-ideas.md), [system plan](system-plan.md), [research and scoring](research-and-scoring.md), and the subsequently added [selected UX specification](ux-spec.md). **The selected specification is authoritative over ideation alternatives.** It resolves product/runtime naming, actual in-page reflow, queued suggestions by default, real provisional preview, authenticated remote access, saved-permission separation, and major user paths. These are no longer open design conflicts. Older alternatives should not drive implementation.

Strengths worth retaining: explicit evidence labels; grounded node identities; constrained execution; no generic restructuring of interactive subtrees; truthful partial coverage; local/cloud distinction; pins and refusal; host-aware rollback; baseline disclosure; and comparison against static personalization. The remaining risk is proving useful, coherent behavior rather than assembling these mechanisms independently.

**Source correction:** the original [goal-objective.md](/Users/tzarski/.codex/attachments/2533f545-25ae-4ff3-9fd1-e4f83dffeaa1/goal-objective.md) was subsequently supplied at its attachment path and read in full. The earlier missing-source limitation is resolved. It explicitly requests end-to-end website-layout reading, model configuration/setup proposals and smart webpage layouts, plus design principles, good/bad paths and judging research. Its pasted participant guide is directly inspected user-provided evidence, not independently authenticated live organizer rules. Git inspection verified current HEAD `e97c307a2b1791d06dbd3190c9887526414d4a86`, dated October 23, and the generic catalog ranker at that commit. Dates alone do not establish organizer-approved provenance. Other working-tree changes were left untouched.

## Severity-ranked remaining gaps

Historical findings from the initial review; the resolution audit at the end supersedes their open/closed status following revisions to the selected plans.

Severity: **High** blocks a credible claim, safe affected workflow, or central product hypothesis; **Medium** weakens usability, evaluation or future expansion. These are planning findings, not observed runtime defects.

| ID / severity | Evidence and consequence | Concrete fix and proof required |
|---|---|---|
| H1 — High: learning-to-page connection is optional | Selected spec permits learned emphasis **or** a leading destination in the extension-owned list. System plan combines page reflow with local destination ranking. A demo could therefore show static page styling and unrelated learned shortcuts while claiming adaptive page layouts. | Make at least one queued learned proposal change an approved **in-page** property, such as emphasis of a grounded card, without changing its semantic order. Trace original nodes → generated catalog → observed events → changed preference → accepted page transaction. Label what reflows from the initial plan and what later adapts from learning. If only the list learns, disclose that limitation. |
| H2 — High: advantage over simpler methods is unproven | Reading comfort and faster access are already served by reading tools, site search, bookmarks, manual preferences and user styles. Neither small-model sophistication nor a clean before/after proves incremental value. | Select one recurring task with a firsthand user; compare native page/search, static pinned/manual adaptation and learned adaptation. Include initial setup, correction and recovery costs. Require demonstrated task benefit before claiming productivity; publish negative cases. |
| H3 — High: preview expiry can itself move a target | Selected spec correctly adds content-side expiry and preserves working website controls. It does not specify what happens when the timer expires during typing, selection, scrolling, pointer-down or an open menu. Restoring geometry can be disruptive even though the action is called cleanup. | Define expiry as an explicit state: stop collection and new writes, mark preview expired, and restore geometry at a safe boundary; retain immediate user-controlled Cancel. Specify maximum pending cleanup and reconnect behavior. Test timeout during a held click and keyboard interaction, panel loss, node removal and navigation. Never claim exact restoration after website actions. |
| H4 — High: protection and usefulness lack an independent oracle | Candidate/protected-region labels partly depend on heuristics and model interpretation. Rejecting 20 malicious JSON plans cannot show whether an ordinary-looking region contains an essential warning or whether semantic grouping was wrong. | Independently annotate eligible regions, exclusions, task-critical context and acceptable transformations before tuning. Include ambiguous warning cards, ordered procedures, dependent controls and visually repeated non-independent items. Measure false-safe acceptance and unnecessary refusal separately. Review disagreement rather than treating model confidence as truth. |
| H5 — High for accessibility claims: test coverage is incomplete | Selected spec has useful keyboard, contrast, motion and 200% zoom requirements, but does not fully specify reflow, text-spacing overrides or assistive-technology reading continuity across page mutations. | Add 320 CSS-pixel equivalent reflow/400% desktop zoom where applicable, text-spacing override checks, focus/reading-position continuity, and named browser/assistive-technology combinations. Test the changed host region and panel together. No claim of accessibility improvement until evaluated with relevant users. |
| M1 — Medium: closed-shadow limit is overstated | System compatibility table says closed shadow roots have “No internal DOM discovery.” Chrome documents an extension API that can return closed roots. This conflates deliberate exclusion with platform impossibility. | Change future wording to “excluded from initial implementation; extension-specific discovery is possible but untested.” Keep canvas-only interfaces separate. See mechanism below. |
| M2 — Medium: setup burden and auth recovery remain unmeasured | The good path contains scan, intent, region selection, data review, authentication, proposal, outline, preview, apply, learning and saving. The spec resolves the auth requirement but not its interruption cost. | Show the shortest supported path, progressively disclose details, preserve local scan across sign-in/cancel, then revalidate before sending. Distinguish expired login, quota and offline errors with appropriate actions rather than one retry loop. Measure time to first useful layout and abandonment. |
| M3 — Medium: evaluation thresholds invite misleading aggregation | Documents propose ≥80% useful proposals, ≥20% faster tasks, 24 page states, and 5–8 participants. No operational definition of “useful” or repeated-measure aggregation is fixed. | Predeclare supported subset and held-out site families; retain all attempted cases and failures. Report person-level paired outcomes, setup and repeat-use separately, denominators at each pipeline stage, and failure reasons. Small formative samples cannot establish population-level gains. |
| M4 — Medium: full-product learning and recipe lifecycle remain underspecified | Origin/template identity, account separation caveats and deletion exist. Long-lived preferences still face task changes, multilingual labels, redesigns, and conflicts between manual settings, learned rules and shared recipes. | Specify precedence: protected constraints → explicit user choices → current task → learned preference. Define unpin behavior, preference expiry, recipe version migration and correction retention. Add staged roadmap gates below rather than assuming a successful demo solves these issues. |
| M5 — Medium: eligibility evidence is incomplete | Detailed scoring and reuse rules are inherited from the quoted guide; public event material does not expose those full terms. | Retain guide attribution; attach the accepted-participant rules/version and baseline/new-work ledger before submission. Do not describe numerical concept scores as predicted judge scores. |

## Full-objective traceability and priorities

The small release is an experiment within the full vision, not a substitute definition of that vision.

| Objective | Required demonstration now | Full-product work still outstanding |
|---|---|---|
| Read unfamiliar layouts | Discover structure on at least two genuinely different page families without bespoke target catalogs; show partial/unsupported coverage | Broader applications, shadow/frame adapters, multilingual/RTL semantics, responsive and virtualized states, calibrated abstention |
| Propose model configuration | Real Meta output changes grounded group membership, allowed presentation or local ranking configuration; user correction affects the executable plan | Reliable correction learning, compatible version migrations, cross-site abstract preferences and cost/latency tuning |
| Produce smart page layouts | Actual reversible grid/density changes plus an accepted preference-driven in-page change; original task remains operable | More transformation families, sustained utility, robust site updates, browser portability and complex interaction preservation |
| Keep user control | Clear data boundary, review-first, pin, pause, undo, deletion, truthful saved/access state | Durable account separation, recipe sharing governance, permission changes and long-term recovery |

**P0:** the complete trace above; explicit data review; authenticated real model request; protected-region enforcement; review/correction; bounded live preview/apply/undo; stale-response prevention; one learning-to-page demonstration; keyboard and recovery checks; baseline and evidence package. Selection removal and correction of an incorrect group are P0 because otherwise the person cannot repair the planner's interpretation.

**P1:** reliable revisits and persistence, broader page-family coverage, clearer receipts, and a labeled shortcut fallback. If persistence is included in the release, its save-failure/delete/access paths become mandatory for that shipped feature. Defer it explicitly if capacity requires; do not display a nonfunctional saved promise.

**Later, still part of the vision:** optional automatic adaptation, shared recipes, cross-site preferences, vision escalation, complex adapters and browser portability. Gate these on repeat-use studies and operation-specific safety evidence. Cross-site preferences should transfer abstract choices, never selectors or assumed account identity. Additional model modalities or an open-weight route should earn their scope through a demonstrated task improvement.

## Alternatives and differentiation

This is a targeted official-source comparison, not an exhaustive competitor survey or a claim of invention.

| Alternative / verified capability | Overlap | Differentiation Smart Web must demonstrate |
|---|---|---|
| [Chrome Reading mode](https://support.google.com/chrome/answer/14218344?hl=EN) provides adjustable text presentation, spacing and read-aloud, in full-screen or side-panel views; its settings apply within reading mode | Comfortable reading, reduced distraction and personalization are established benefits | Operate on useful regions of the original working page while preserving its interactions; show why a reading view does not solve the selected task |
| [Copilot in Edge](https://support.microsoft.com/en-us/edge/copilot/getting-started-with-copilot-in-microsoft-edge) uses page context for answers and summaries; [Browse with Copilot](https://support.microsoft.com/en-us/edge/copilot/browse-with-copilot) also documents browser actions | Understanding page content and assisting workflows are not unique; “other sidebars only summarize” is inaccurate | A persistent, reviewable layout contract and local preference loop that lets the person operate the adapted page; compare on that outcome |
| [Stylus](https://github.com/openstyles/stylus), maintained as a userstyles manager | Changing website presentation is not new by itself | Generate and validate a page-grounded configuration without asking users to write styles, then sustain useful preferences and explain failures |
| Native search, bookmarks, site settings and manually pinned shortcuts | Low-setup access to repeated destinations; proposed benchmark controls | Net benefit after setup, fewer wrong-target activations, and useful improvements beyond a fixed shortcut list |

**Defensible positioning hypothesis:** “Smart Web proposes a reviewable layout for supported regions of your working page, then helps you refine it with local preferences.” Its potential novelty is the integrated configuration and adaptation loop. Neither local ranking, generated JSON, a side panel, CSS inference nor page restyling alone establishes novelty. No broad “first,” “unique,” “works everywhere” or market superiority claim is supported by this research.

## Good paths and bad paths: remaining acceptance details

The selected specification already covers most states. The following add precise observable outcomes rather than reopening resolved design decisions.

| Scenario | Acceptance evidence |
|---|---|
| First use, no account | Local inspection succeeds; user can decline upload and continue using the original site. Sign-in returns to the same scan only after identity/viewport revalidation; no data uploads merely because login completed. |
| First useful transformation | User identifies the intended region, corrects a grouping if necessary, sees actual reflow, applies, and completes the original task. Record assistance, corrections and setup time. |
| Learning and rejection | Explicit activation evidence changes a queued in-page suggestion. Pin wins; rejection suppresses recurrence for the visit; Pause stops both collection and application. Programmatic events do not count as genuine user evidence. |
| Return to saved layout | Revalidation detects changed same-length catalogs and missing permission. Status distinguishes remembered settings, access, active layout and active learning. Revisit test includes another account on the same origin. |
| Website action during preview | Real link activation or input is not undone by Cancel; route changes detach the transaction. Copy explains that layout undo is not website-history undo. Test pointer, keyboard and screen-reader activation. |
| Preview expires or panel disappears | No timer-driven movement during a protected interaction; recoverable status remains available after reconnect. Cleanup never reconstructs removed host nodes. |
| Wrong tab, late result or canceled correction | Request identity and graph version prevent any write. A newer user correction cannot be overwritten by an older valid response. |
| Model failure or ambiguous region | Preserve original usability; distinguish service retry from reauthentication or no safe change. No confident success badge for rejected or partial results. |
| Private label or hostile page instruction | Inspect transmitted payload and logs, including optional free-text task input. An exact preview is useful disclosure but is not proof of reliable redaction. Hostile instructions cannot change allowed operations or trusted metadata. |
| Larger spacing, dimming or narrowed viewport | No clipped controls, lost warnings, unreadable contrast, overlapping targets or displaced focus. Dimming must pass contrast checks; opacity is not automatically safe. |

## Accessibility and browser constraints: verified corrections

**Closed shadow roots are not categorically unreadable to Chrome extensions.** Ordinary `element.shadowRoot` does not expose a closed root, but Chrome documents:

```js
const root = chrome.dom.openOrClosedShadowRoot(element);
```

`element` is the host element; the result is its open or closed shadow root, or `null` when there is none. This is the shape “use an extension-specific API rather than assume ordinary page APIs define the limit.” Documentation establishes a possible inspection path; **it was not executed in this review and does not establish safe modification, portability or canvas semantics**. Optional later work: capability-detect this API and test a dedicated adapter. Exclusion from the initial release remains reasonable. [Chrome DOM API](https://developer.chrome.com/docs/extensions/reference/api/dom).

Temporary page access remains correctly scoped: `activeTab` plus `scripting` allows eligible injection after invocation, survives same-origin navigation, and is revoked on cross-origin navigation. Saving a recipe does not grant future access. The selected UX already handles this distinction. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

Accessibility validation needs more than attractive tokens:

- Test reflow at the equivalent of **320 CSS pixels**, commonly a 1280-pixel desktop viewport at 400% zoom, accounting for permitted two-dimensional content exceptions. A 200% check alone does not establish this. [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Apply text overrides together: line height 1.5 times font size, paragraph spacing 2 times, letter spacing 0.12 times, and word spacing 0.16 times; verify no lost content or functionality. These are override-resilience checks, not mandatory default styling. [W3C Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).
- Preserve meaningful, operable focus order; exact visual/DOM identity is not an absolute WCAG rule. Smart Web can adopt the stricter conservative policy for generic transformations without misquoting the standard. Test screen-reader browse order separately from keyboard focus, including when focus stays in the panel while the page changes. [W3C Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
- Keep 44-pixel targets as the selected product ambition; the AA minimum criterion is 24 by 24 CSS pixels with exceptions. Measure rendered targets and spacing rather than treating a token as compliance. [W3C Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Full-product accessibility evidence must include people using the relevant access methods. Developer keyboard and screen-reader smoke checks can catch defects; they do not establish user benefit or certify the host website.

## Official-source claim audit and provenance

| Claim | Validation status and required wording |
|---|---|
| Meta model and standard-mode behavior | Official docs list `muse-spark-1.3`, multimodal input, structured output and no training on standard-mode content. Verified documentation, **not** account access, latency, zero retention or a working integration. [Meta models](https://dev.meta.ai/docs/models). |
| Strict configuration output | Docs confirm `response_format.type = "json_schema"`, `response_format.json_schema.strict = true`, all properties required and `additionalProperties: false` for the strict subset. Research document is supported. This does not validate page semantics, target identity or useful layouts. [Meta structured output](https://dev.meta.ai/docs/structured-output). |
| Estimated request cost | Official standard input/output rates are $1.25/$4.25 per million tokens. The stated 8,000-input/2,000-output estimate is correctly $0.0185; 500 such calls are $9.25 before other usage. Credits and actual payload sizes remain unverified. [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits). |
| Event timing | Public page lists October 26 kickoff, October 27–November 4 workshops, November 4 at 9 PM ET submission and November 4–8 judging. Do not describe October 27 as independently verified official start of building. The supplied-guide difference should remain explicit. [Organizer event](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon). |
| Detailed rubric and eligibility | Direct reading of the supplied objective confirms the pasted guide's 30/25/20/25 weights, three-minute video, four-person limit, credit-claim conditions and bonus-model instructions. Its existing-codebase exception explicitly names startups; applicability to an Indie entry remains to be confirmed. The [waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) returned only “Loading...” in the initial research. These are verified contents of the supplied guide, not independent authentication of current organizer rules or participant eligibility. |
| Pre-event novelty | Verified Git history includes October 22–23 adaptation work and generic catalog ranking in HEAD. `src/app/hold.ts` explicitly excludes touch/keyboard holds; it cannot establish complete stability. Generic ranking itself must not be called newly invented during the event. |
| Human benefit / safety / generalization | No observed human outcomes or runtime results in this review. Claims of 20% savings, 80% useful coverage, seamless undo, privacy protection, cross-site learning or accessibility improvement must remain targets until measured. |

Recommended provenance ledger: baseline hash; component; reused/extended/new classification; event diff; validation artifact; demo timestamp. Include uncommitted pre-event material separately if present; a baseline commit alone can omit it. Newness should center on external-page discovery, Meta configuration, extension execution/control and demonstrated generalization. Inherited CSS inference may support the architecture but is not the event's new contribution.

## Proposed user tests and evaluation package

No recruitment or tests have occurred. Use consenting participants and owned/public nonsensitive tasks. If recruitment fails, report scripted technical results and expert review under those names; do not substitute simulated participants.

1. **Comprehension and control, 5–8 formative participants if available.** Ask participants to explain what leaves the device, what will change, whether learning is active, and whether saving grants permission. Give preview/reject/apply/undo/save/revisit/delete tasks without coaching. Report individual completion, assistance and misconceptions. An 80% target is a planning threshold, not statistical validation; any consequential misunderstanding requires redesign.
2. **Incremental task value.** Use comparable tasks with counterbalanced original/native-tools, static manual/pinned and learned conditions. Use different targets to reduce memorization. Record completion, wrong activations, failed attempts, setup, correction, recovery and preference. Report per-person paired differences, not clicks as independent participants. Separate repeat-use gains from first-use cost. Estimate break-even visits only if repeat savings are positive: setup cost divided by savings per visit, with correction overhead included.
3. **Stability over repeat visits.** Revisit after an interval and introduce a new task. Check whether old preferences become obstacles, pins remain understandable and users can recover their spatial context. A staged click sequence may demonstrate mechanism but cannot prove durable preference learning.
4. **Access-method sessions.** Include keyboard-only and experienced assistive-technology users where available; document browser, OS, screen reader, zoom and input method. Exercise reading across transformations, region selection, preview expiry, errors and return to page. Report missing combinations rather than treating one session as accessibility validation.
5. **Planner and executor evaluation.** Keep the proposed 24 states (8 development, 16 held-out) only with site-family separation. Add independently labeled expectations and natural semantic mistakes to adversarial JSON cases. Compare deterministic heuristics and Meta under the same graph, operation set and validator. Record useful safe coverage, false-safe plans, correction burden, abstentions, latency and cost. Report optional screenshots separately.

For each page, retain: family/state, declared eligibility, scan coverage, planner result, validator result, applied operations, original-task result, restoration result and failure reason. Report useful safe adaptations both over **all attempted pages** and over the **predeclared supported subset**. This prevents an excellent conditional success rate from hiding low practical coverage. Zero observed failures is limited to the tested corpus.

## Judging evidence and release decision

Use the guide-attributed rubric conditionally; no independent judge-score prediction is justified.

| Criterion | Evidence with the strongest claim support | Remaining weakness |
|---|---|---|
| Impact — 30% | Real repeated task, comparison with simple alternatives, setup-inclusive results and failure counts | Demand and net benefit are hypotheses until tested |
| Meta tooling — 25% | Redacted real request/result, grounded configuration, correction, held-out page, matched heuristic ablation | A valid JSON response or extra API call alone does not show meaningful contribution |
| Execution — 20% | Reproducible install; host task intact; stale/unsafe proposal rejection; rollback; learning-to-page trace; accessibility checks | Broad architectural completeness is not evidence of implemented reliability |
| Demo — 25% | One understandable complete task, second page structure, visible recovery, honest measured result and baseline disclosure | Three minutes cannot support every feature; avoid spending it navigating configuration details |

Suggested demo emphasis: 20 seconds on task and inherited foundation; 50 on scan, real proposal and actual reflow; 35 on completing the task and accepting a learned in-page change; 35 on a second structure and recovery; 25 on comparative evidence; 15 on scope and new contribution. Label edited waiting time, prerecorded inference, synthetic event sequences and fixtures. A recorded demonstration is not a human study.

**Decision gate:** proceed when the end-to-end trace works on two distinct page families, one learned change affects the actual page, original tasks remain operable, high-severity recovery/accessibility cases pass on the declared corpus, and the evidence ledger separates observed results from targets. If only shortcuts work, report a partial delivery of the original objective. If static layout changes work but learning adds no benefit, ship the useful static behavior with that limitation and retain adaptive layouts as an unvalidated part of the full vision.

## Review verification and limits

All five planning documents were read, primary sources above were opened, and selected source/history evidence was inspected. The follow-up also read the original objective at its supplied attachment path and reread the revised system plan and selected UX specification. The generic ranker and pointer-only hold observations are source findings, not runtime checks. The waiver's detailed text remained unavailable in the initial research; broad web research was not repeated for the follow-up. No extension benchmark, browser interaction, provider entitlement check, token-cost measurement or human validation was performed. Only `product-validation.md` was authored by this review.

## Resolution audit — 27 October 2026 follow-up

**Outcome: H1–H5 and M1–M5 are addressed at the planning level. No remaining high-severity contradiction was identified in the selected product/UX behavior.** This closes specification gaps, not implementation gates or claims of human benefit. The full objective remains intact; the hackathon slice is still only a bounded demonstration.

| Findings | Resolution verified in revised documents | Evidence still required during implementation |
|---|---|---|
| H1 | System plan's required learning proof and UX acceptance gate mandate the node → catalog → observations → ranking delta → accepted **in-page** transaction trace | A real trace on supported pages; distinguish learned preference from a manually pinned outcome |
| H2, M3 | Evaluation now includes native/static/learned alternatives, auth/setup/correction/recovery cost, person-level results, repeat visits and both coverage denominators | Actual task measurements and failures; positive net savings cannot be inferred from the plan |
| H3 | Preview lease enters `expired-pending-restore`, disables Apply/learning and waits for safe restoration; scoped Escape, focus ownership and resume checks are explicit | Expiry during pointer-down/selection/focus, suspension, reconnect and host mutation; no hard timer guarantee is claimed |
| H4 | Independent pre-tuning semantic annotations, misleading natural cases, disagreement review, false-safe and refusal measures are specified | Labeled corpus and independent review; validator and schema success alone remain insufficient |
| H5 | 400%/320 CSS-pixel reflow, simultaneous spacing overrides, reading continuity and named VoiceOver/NVDA combinations are added | Rendered host/panel checks and relevant user sessions; unavailable combinations must remain labeled untested |
| M1 | Closed-root discovery is correctly described as an initial exclusion rather than Chrome impossibility | Dedicated adapter testing only if this scope is later enabled |
| M2 | Minimal recommended path, preserved scan, post-auth revalidation and renewed data review, and differentiated auth/quota/offline recovery are explicit | No upload on login completion; measured setup burden and recovery comprehension |
| M4 | Constraint precedence, unpin behavior, task review, inactivity expiry and identity/version revalidation are specified; system plan resets mismatched ordered mappings | Revisit, changed-task, permutation, account and storage-conflict tests |
| M5 | The original guide is now directly read; supplied-guide versus public-rule provenance is clear | Confirm actual track/reuse eligibility, accepted rules and event contribution ledger before submission |

**One high-priority submission question remains, rather than a runtime planning contradiction:** the supplied guide expressly permits *startups* to build on existing codebases, while the plan provisionally allows an Indie entry using the inherited ranker. The text does not establish whether that exception also covers Indie entrants. Do not assume either eligibility or ineligibility. Obtain organizer clarification for the actual track and reuse boundary before submission; retain the explicit baseline/new-work disclosure meanwhile. This is an external rules decision, not a future implementation test.

Two minor wording inconsistencies remain: the UX bad-path table still groups auth/quota failures under generic Retry despite the newer differentiated recovery paragraph; the system plan still says “Cancel always removes it” despite deferred/partial restoration semantics. Align these summaries with the detailed selected rules. They do not reopen H3 or M2 because the governing behavior is now explicit. Likewise, the older 200% interaction row is supplemented by the new 400%/spacing/AT requirements, not a reason to omit them.

No additional high planning blocker is asserted merely because the prescribed tests have not yet run. Runtime safety, useful learning, comparative impact, accessibility and model access remain future verification work. This follow-up performed document inspection only, with no agents spawned and no broad research repeated.
