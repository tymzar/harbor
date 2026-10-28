# Astra product ideation: a personal layout compiler

> Synthesis note: this is an independent ideation record. [Selected UX](ux-spec.md) and the [system plan](system-plan.md) supersede alternatives below. “Astra” in tentative product wording is not the runtime model: Smart Web uses Meta for page planning. A shortcut-only fallback is explicitly a shortfall against the requested in-page layout scope.

Planning only · 27 October 2026 · Product-concepts contribution from one of the two requested Astra ideation agents. No agents spawned. This document is the sole owned deliverable.

## Recommendation and evidence labels

**Proposed direction:** Build an extension that turns an unfamiliar page into a reviewable adaptation configuration, then uses local preference learning to make its useful regions easier to reach. The differentiator is the bridge from unknown website structure to a constrained, personal interaction model—not a summary, a screenshot critique, or a reader view.

**Positioning hypothesis:** “Your tools should learn where you work. Astra understands a page, proposes a safer layout, and learns your preferences without sending every interaction to a cloud model.” Use “safer” only as a design intent until evaluated.

Labels used throughout:

- **Verified—source inspection:** directly observed in local files; no application or tests were run for this planning contribution.
- **Provided—brief:** stated in the supplied `goal-objective.md`; not independently confirmed with event organizers.
- **Verified—documentation:** supported by the linked official browser documentation; not tested in this repo.
- **Proposed / hypothesis:** design choice, estimate, or expected benefit requiring implementation or evidence.

The supplied guide gives impact 30%, Meta tooling 25%, technical execution 20%, and demo 25%; a three-minute video; public repository; and a requirement to identify work created during the event. It describes October 27–November 4 as the building period and November 4 at 9 PM Eastern as the submission deadline. **Provided—brief.** Confirm the live submission page and deadline independently. Do not imply that this ideation document verifies model availability, event rules, or eligibility.

## What already exists, and what would be new

The user identifies this repository as a pre-event adaptive app prototype. Source inspection supports the following reusable foundations, but does not establish their current runtime reliability or date of authorship.

| Foundation | Evidence | Reuse boundary |
|---|---|---|
| React/TypeScript/Vite application | `package.json`; README remains the generic Vite template | UI/toolchain foundation, not an extension already built |
| Generic grouped-item ranker | `src/model/ranker.ts`: `Catalog`, `CatalogIndex`, `Ranker`; variable group/item counts; masked outputs | Can consume an extracted catalog, but currently does not discover one from arbitrary DOM |
| Local preference machinery | `src/model/config.ts`, `ranker.ts`: decayed affinity, small MLP, accuracy-weighted blend, duplicate-event suppression | Reuse learning primitives; do not present them as new Meta inference or assume click frequency equals task success |
| Stabilized reordering | `src/app/adaptive.ts`: minimum evidence and hysteresis | Useful policy foundation; parts use the fixed Harbor card/category contract and need generalization |
| Pointer hold | `src/app/hold.ts`: holds order while mouse/pen is over a list | Existing protection is explicitly not a keyboard hold; focus, typing, selection, and drag protection are new requirements |
| Persistence and model controls | `src/model/persist.ts`, `src/app/modelbar.tsx`: save, import/export, reset/replay controls | Existing UI patterns; origin/template scoping and dynamic-catalog migrations remain new work |
| CSS computation/visualization bridge | `src/app/cssnetBridge.ts`, `src/cssnet/contract.ts` | Optional inherited technical foundation. Do not use existing neural visuals as the headline new demo |

No extension manifest appeared in the targeted local filename search. This is **limited negative evidence**, not an exhaustive audit. No Meta integration was established by these reads. Existing test files show intended checks, not passing results from this session. Other working-tree changes were present and left untouched.

**New hackathon contribution proposed:** extension packaging and activation; unknown-page structural extraction; Meta-assisted region interpretation; typed configuration synthesis; confidence/evidence display; compatibility validation; reversible application; dynamic-page invalidation; generic event bindings; extension-specific privacy controls; and evaluation on pages outside the original app.

Before implementation, record the agreed pre-event commit and a component-level provenance ledger. Classify copied code as reused, modifications as extended, and new modules as new. The submission should explain this boundary in prose and a diff. Demo narration: “We began with a local adaptive ranker. During this event we built the extension that configures it from unfamiliar websites.” Do not claim dates from Git timestamps alone without checking the actual event baseline.

## Differentiated product concepts

All concepts and scoring below are hypotheses. Scores are directional team prioritization, not predicted judging results. Weighted total = 0.30 impact + 0.25 Meta + 0.20 technical + 0.25 demo, each scored 0–10.

| Concept | Distinct product promise | Meta contribution | Impact / Meta / Technical / Demo | Weighted | Tradeoff |
|---|---|---|---|---|---|
| **A. Personal layout compiler** | Discover meaningful groups and configure a stable personal layout on an unfamiliar site | Infer semantic grouping, constraints, and appropriate adaptation from DOM evidence and optionally imagery | 8 / 9 / 8 / 9 | 8.50 | Strong integration story; arbitrary DOM mutation is the largest execution risk |
| **B. Task workspace lens** | “I am reviewing changes”: reveal and organize relevant regions while preserving the original workflow | Translate explicit task intent into region priorities and protected actions | 8 / 9 / 7 / 9 | 8.30 | Immediate usefulness and easy demonstration; task inference can conceal important context |
| **C. Stable access profile** | Carry explicit preferences for spacing, target size, motion, and navigation prominence across sites | Map user-declared needs to each page’s available structure | 9 / 7 / 7 / 8 | 7.85 | Strong potential benefit; meaningful accessibility claims require user testing and interaction audits |
| **D. Interface recipe studio** | Let users correct, inspect, and share site-specific adaptation recipes | Propose recipes and diagnose why a recipe no longer matches a page | 6 / 8 / 9 / 7 | 7.35 | Strong technical artifact and inspectability; weaker immediate consumer story and sharing risks |

**Choose A, with one explicit task from B.** Borrow C’s stability principles and D’s inspectable recipe, without shipping four products. The initial user is someone repeatedly navigating dense documentation, project directories, or resource catalogs. This is a target-user hypothesis, not validated demand. Pick one firsthand workflow with the team before building; show a measurable task rather than a vague promise to improve everyone’s browsing.

Alternative positioning if evidence changes: B becomes the lead if task-based grouping proves substantially more reliable than preference inference. C should become the lead only with participants who can evaluate the actual access needs, not inferred diagnoses or claims to repair every inaccessible site.

## How understanding, configuration, and adaptation connect

**Constraint:** the existing ranker requires known groups and item identities. An arbitrary page supplies neither a trustworthy catalog nor safe movement boundaries. A model returning attractive CSS does not solve identity, live-event integrity, focus, or rollback.

**Proposed mechanism:** discover → interpret → configure → validate → preview → apply → learn → revalidate.

1. On deliberate activation, an extension collector builds a bounded graph of visible regions: landmarks, headings, labels, rectangles, repeated siblings, links, roles, and relationships. Assign transient node IDs locally. Do not send full HTML, form values, hidden text, credentials, or unrestricted browsing history.
2. Ask an eligible Meta model to interpret this evidence against a user goal. It proposes group membership, which regions must stay fixed, supported operations, and a short explanation referencing node IDs. An optional cropped screenshot is an explicit escalation for ambiguous structure, only after privacy review and model-capability verification.
3. Compile the proposal into a typed configuration consumed by a generic adapter and the local ranker. A deterministic validator resolves every ID against the current snapshot, rejects unknown operations and missing evidence, and checks compatibility. Model confidence is a suggestion, not a safety gate by itself.
4. Preview the concrete changes. Apply only the accepted configuration. Learn from deliberate local actions and explicit keep/pin/reject feedback; do not send every click back to Meta. Schedule changes at task boundaries rather than under an active pointer or keyboard focus.
5. On a route change or substantial mutation, invalidate affected bindings. Pause rather than repeatedly fighting the host framework. Re-extract and ask for a new preview when the configuration changes materially.

**Proposed application configuration sketch, not a verified Meta API request:**

```json
{
  "schemaVersion": 1,
  "scope": { "origin": "https://demo.example", "template": "resource-grid-v1" },
  "snapshotId": "scan-42",
  "goal": "Reach frequently used resources",
  "catalog": { "groups": [{ "id": "resources", "items": ["n12", "n13", "n14"] }] },
  "bindings": { "n12": { "regionId": "r3", "evidenceId": "e12" } },
  "policy": {
    "allowedOperations": ["promoteShortcut", "reorderCompatibleGroup"],
    "protectedRegions": ["r1", "r4"],
    "applyMode": "previewRequired",
    "holdDuring": ["pointer", "focus", "typing", "selection", "drag"]
  },
  "learning": { "profile": "conservative-v1", "storage": "local", "scope": "origin-template" }
}
```

This is an abbreviated contract; implementation needs complete bindings, limits, validation errors, operation-specific preconditions, and rollback records. Semantic IDs are locally resolved references, not arbitrary model-authored selectors or executable code. The model may choose a validated learning-policy preset; it should not invent neural weights, learning rates, or unrestricted event tracking. The existing small model learns preferences; the Meta model interprets page semantics. These are different responsibilities.

**Honest limitations:** arbitrary-page analysis is a goal, not universal page transformation. The supported slice is top-level, visible semantic DOM with bounded repeated groups and stable links. Canvas-heavy applications, inaccessible frames, closed components, virtualized lists, rich editors, and unstable host rerenders are exclusion candidates pending independent research. Preserve forms, authentication, destructive controls, warnings, and transaction regions. A shortcut shelf is a legitimate fallback, but must be labeled “shortcut mode”; it does not prove in-place adaptation.

**Optional upgrade path:** richer vision-assisted interpretation, template-specific adapters, and a larger compatibility corpus can expand coverage later. None is required to validate the basic compiler loop.

## Application choices and tradeoffs

| Choice | Recommended slice | Cost / honest limitation |
|---|---|---|
| DOM versus screenshot understanding | DOM evidence first; optional cropped visual evidence later | DOM lacks some visual semantics; screenshots introduce privacy, cost, and grounding problems |
| In-place layout versus extension workspace | One validated in-place repeated group plus an extension-owned shortcut shelf fallback | Reparenting can break application assumptions; shelf duplication can confuse navigation if presented as the original page |
| CSS visual order versus DOM movement | Decide per tested adapter; no generic CSS-order shortcut | Visual and keyboard/reading order may diverge; moving nodes may break framework state. Reject the operation if consistency cannot be demonstrated |
| Automatic versus suggested changes | Preview required; later local updates offered at a stable boundary | Lower autonomy, substantially more predictable interaction |
| Preference versus explicit intent | Explicit goal seeds configuration; deliberate use refines ranking | Historical popularity can fight today’s task. Pin and task reset must override learning |
| Cloud interpretation versus local learning | Meta for bounded semantic configuration; local ranker for repeated use | Initial setup still sends an approved payload. “Fully private/offline” would be false |
| New UI versus inherited visualizations | Small side panel, region outline, preview, undo | Less spectacle from neural graphics; greater clarity about event-created functionality |

**Verified—documentation:** Chrome content scripts share the page DOM but execute in an isolated JavaScript environment by default. This permits inspection but does not expose the host application’s internal variables or guarantee mutation compatibility. See [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts). **Proposed:** begin with user-triggered activation and investigate the minimum permissions. Verify supported URL classes, frame access, service-worker behavior, and deployment policy before treating that design as settled.

## User experience: earn trust through visible control

Use a compact side panel with a clear sequence: **Understand this page → Review setup → Preview → Apply**. Default surface: current goal, supported-region count, proposed changes, and protected regions. Put model configuration and evidence in an expandable detail view, not the main onboarding path.

| Journey | Proposed experience | Required verification |
|---|---|---|
| First successful use | Activate on a dense resource page; approve bounded data use; choose a goal; inspect highlighted region; preview; apply; use the original link | Link destination, focus order, scroll position, and page state survive |
| Returning user | Revalidate saved origin/template recipe; show existing personalization and any new proposal | Do not silently reuse stale selectors or apply a profile to another origin |
| Wrong interpretation | “This group is navigation, not content” correction; regenerate only affected configuration | Correction changes the actual catalog/policy, not just explanation text |
| Wrong preference | Pin original position, undo latest adaptation, or reset this site | Undo is not counted as positive engagement; explicit preferences win |
| Page changes mid-preview | “This page changed. Review an updated setup.” | Reject stale snapshot before applying |
| Unsupported content | Highlight what could be inspected, explain excluded region, offer labeled shortcut mode if possible | No success claim or fake confidence for inaccessible structure |
| Timeout or invalid model response | Keep original page; retry or cancel; preserve local settings | No partial mutation, no spinner forever, no silent switch to a non-Meta model |
| Keyboard or reduced-motion use | Preserve focus; queue adaptation until task boundary; announce completion concisely | No focus loss, obscured target, uncontrolled motion, or broken reading order |

UX skill consulted: `ui-ux-pro-max` (`.../skills/ui-ux-pro-max/SKILL.md`), targeted searches for user control and focus restoration. Cancellable transitions and focus visibility are relevant returned guidance; carousel/breadcrumb results were not used as evidence for this product. Proposed principles: user control over movement, cancellation correctness independent of animation completion, visible focus, labeled controls, readable hierarchy, and progressive disclosure. This is a planning application of guidance, not an accessibility certification.

Do not optimize “engagement.” Optimize successful access with fewer unnecessary searches and corrections. An accidental click, a hover, or repeated frustrated clicking is not reliable preference evidence. Let users stop learning for the site and delete its local profile.

## Feature priority and the October 27–November 4 slice

**Capacity assumption:** one or two active builders, roughly nine calendar days, existing ranker reusable, accessible eligible Meta endpoint available early. None is confirmed here. If capacity is lower, drop stretch scope before dropping validation or provenance.

| Priority | Deliverable | Definition of done |
|---|---|---|
| P0 | Extension activation and bounded extraction | Two different page structures produce region graphs without site-specific catalogs; an unsupported page is identified |
| P0 | Real Meta configuration generation | Live eligible-model response produces schema-valid grounded catalog/policy; model and request outcome visible in diagnostics |
| P0 | Preview + one safe in-place operation | One compatible repeated group adapts; original links work; keyboard order agrees; undo restores extension-owned changes |
| P0 | Local personalization bridge | Extracted catalog feeds reused ranker; a short deliberate interaction sequence produces a visibly explained proposal |
| P0 | Protection and lifecycle | Focus/pointer hold, stale-snapshot rejection, cancel, reset, and mutation-triggered pause work |
| P0 | Evidence and submission | Baseline/new-work ledger, task measurements, public-ready instructions, three-minute recording |
| P1 | Correction workflow and shortcut fallback | Wrong grouping can be corrected; unsupported in-place mode has an honestly labeled alternative |
| P1 | Saved recipe with explicit revalidation | Revisit does not corrupt state or apply stale mappings |
| P2 | Multimodal escalation | Only if DOM failure cases justify images and model/privacy feasibility is validated |
| Later | Cross-site preference transfer, recipe sharing, local large-model inference, broad browser coverage | Separate roadmap; no dependency in the demo’s critical path |

**Proposed schedule and gates:**

- **Oct 27:** baseline/provenance, firsthand task selection, endpoint/model eligibility probe, permission and mutation feasibility spikes. Gate: working real model request and one safe extension inspection.
- **Oct 28:** graph extraction and manual gold annotations on two distinct page structures; contract and protected-region policy. Gate: inspectable grounded catalog, not handcoded site IDs.
- **Oct 29:** real Meta proposal → validator → preview. Gate: malformed or invented IDs cannot reach the executor.
- **Oct 30:** one reversible in-place adapter and tested original interactions. Gate: no keyboard-order mismatch or host-state breakage on supported examples.
- **Oct 31:** connect generic ranker, local event mapping, stable-boundary proposals. Gate: adaptation comes from actual interaction, with explicit preference override.
- **Nov 1:** mutation invalidation, cancellation, unsupported path, privacy inspection, held-out page. Gate: fail safely without misleading “works everywhere” copy.
- **Nov 2:** small task study, static-baseline comparison, model ablation; fix highest-impact failures. Freeze feature scope.
- **Nov 3:** record, reproduce from clean install, reconcile event-created contribution ledger, check public submission assets and links.
- **Nov 4:** buffer, final rehearsal and submission before confirmed deadline. No new core features.

If in-place safety fails the Oct 30 gate, ship the honest shortcut-workspace mode and narrow the claim; it remains a useful configuration compiler but a weaker demonstration of smart page layout. If the eligible Meta endpoint fails, prioritize resolving eligibility/access rather than replacing it silently. Cached outputs may support development or a clearly labeled replay, but cannot be presented as live inference.

## Winning narrative and proof by rubric

Lead with **Build for Your World**, subject to organizer confirmation: people repeatedly navigate interfaces whose layouts were designed for a generic user. The proposed benefit is faster access while keeping the site’s real capabilities and control with the user.

| Rubric, from supplied guide | Concrete evidence to build | Claim to avoid |
|---|---|---|
| Impact 30% | One real repeated task; original versus adapted completion time, errors, and user preference; show who benefits | Invented time savings, clinical/accessibility efficacy, or universal compatibility |
| Meta tooling 25% | Meta grounds semantic groups and protected regions into a configuration that changes actual behavior; compare with deterministic grouping | A decorative chat response or calling the inherited MLP a Meta model |
| Technical 20% | Typed contract, binding validation, generic catalog bridge, rollback, stability, held-out structure, explicit failure handling | Assuming a schema validates semantics or that isolation guarantees DOM safety |
| Demo 25% | Obvious task friction → inspectable proposal → working changed page → learning → undo/unsupported state | Before/after mockups, hidden hardcoded selectors, inherited features presented as new |

**Proposed three-minute video:** 0:00–0:20 show one person losing time finding a recurring resource; state the pre-event foundation. 0:20–0:50 activate on an unfamiliar-to-the-adapter page and show region grounding. 0:50–1:20 show the Meta-produced configuration and a concise preview. 1:20–1:55 apply, use original links, then demonstrate a genuine local preference proposal. 1:55–2:20 show a second structure and an unsupported/protected case. 2:20–2:40 undo and show task evidence. 2:40–3:00 recap specifically what was built during the event and the limited supported scope. If waiting time is edited, label elapsed inference time; do not fake immediacy.

**Proposed evaluation, not results:** three to five formative participants, counterbalanced original/adapted tasks, report per-person time and errors rather than claiming statistical generalization. Record proposal acceptance, undo rate, broken original controls, focus failures, setup latency, and model cost. Use two development page families and at least one held-out structure; report coverage denominator and abstentions. Proposed release gates: zero destructive changes, broken tested links, or focus-loss failures on the declared demo corpus; all stale snapshots rejected; all tested supported patches reversible. These gates establish corpus behavior, not general safety.

The Meta ablation should compare DOM heuristics alone against the same heuristics plus Meta interpretation using human-labeled group/protected-region judgments and accepted configurations. If Meta adds no measurable value, revise the use case rather than adding more API calls. Separate setup cost from steady-state local interaction latency. Budget cannot be estimated responsibly until endpoint pricing and payload size are verified.

## Ambitious vision after the slice

The full product is a personal interface layer across web tools: explicit goals and preferences map to page-specific layouts, a local model refines those choices, and the user can inspect or revoke every recipe. Later capabilities could include adaptable workspaces spanning several tabs, semantic navigation that survives cosmetic redesigns, intentional focus sessions, and portable access preferences. A recipe ecosystem could let site owners publish compatible regions rather than forcing brittle reverse engineering.

Each expansion needs evidence: cross-site transfer must not leak private content or transfer an irrelevant preference; shared recipes need review and capability limits; multi-tab operation needs per-origin permission and a clear task boundary. Universal analysis should produce a capability report, including “cannot safely adapt,” rather than a universal mutation promise.

## Independent research queue and decision-changing risks

This document is ideation with a brief prototype inspection and one browser-documentation check. The following require independent research; do not treat the provided model names as verified API identifiers.

| Assumption / risk | Needed evidence | Decision if false |
|---|---|---|
| Event guide and model list are current; reused foundation is eligible | Official current rules, submission fields, organizer clarification where needed | Adjust scope and contribution claims before recording |
| Named Meta models/endpoints support required input and reliable structured output | Official docs plus real requests: exact identifiers, access, image support, schema support, latency, quotas, prices | Use validated text-graph path and eligible endpoint; no invented feature support |
| People want adaptation more than a pinned shortcut list | Interviews and comparative task trials | Simplify or switch lead concept to explicit task workspace |
| Layout can be understood without broad sensitive uploads | Inspect actual outbound payloads; test redaction on realistic sensitive pages | Restrict eligible pages/regions, require review, or abstain; do not promise perfect redaction |
| Generic in-place transformation preserves host behavior | Framework, focus, event, mutation, layout-order, and rollback experiments | Restrict adapter eligibility or use labeled shelf mode |
| Existing generic ranker can handle changing catalogs | Review persistence shape checks, identity migration, group changes, memory/CPU costs | Reset per template or use a bounded fresh catalog; never silently load incompatible weights |
| Small model learns useful preference rather than positional bias | Compare frozen order, explicit pins, affinity-only, and blended ranking | Use simpler baseline; keep sophistication only when it improves task outcomes |
| Prompt injection in page labels cannot trigger unintended behavior | Adversarial labels, invented IDs, hidden instructions, unsafe-operation requests | Enforce inert evidence, closed operation vocabulary, local validation; reject unsafe proposals |
| Proposed activation and distribution are feasible | Official browser permission/store guidance and clean extension installation test | Narrow browser/distribution path; do not depend on store review completing before deadline |
| An extension-owned overlay can coexist with host accessibility | Keyboard, reading-order, focus visibility, zoom, reduced-motion, and screen-reader checks | Reduce overlays or disable incompatible mutations |

The largest product risk is motion that destroys trust; the largest engineering risk is corrupting a live application; the largest competition risk is showing inherited adaptation while the new Meta bridge remains superficial. The proposed slice addresses all three by making the configuration-to-behavior loop inspectable, constrained, and demonstrably new.
