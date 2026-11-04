# Astra UX ideas: a reversible adaptive layer for the web

> Synthesis note: this is an independent ideation record. [Selected UX](ux-spec.md) resolves the provisional product name, authentication, preview interaction, and default-adaptation alternatives. Harbor is the product; Meta is the runtime planner; Astra produced this design proposal.

Planning contribution by one of the two requested Astra ideation agents. No agents spawned. Scope: UX principles, screens, interaction ideas, recovery, and validation. Planning only; none of the extension behavior below is implemented by this document.

## Evidence and confidence

- **Verified in supplied material:** `goal-objective.md` asks for arbitrary-page layout discovery, model configuration proposals, and smart adaptive layouts. Its pasted participant guide requires Meta models, distinguishes new event work from pre-existing foundations, and gives impact/tooling/execution/demo weights of 30/25/20/25. The guide itself was read; current event rules and model availability were not independently verified here.
- **Verified by source inspection:** this repository is a React/TypeScript/Vite application using HeroUI, with fixed card contracts, ranking, pointer signals, model persistence, and inspection controls. This is evidence of code, not proof that every path currently works.
- **Verified visual artifact:** inspected `reports/screens/visuals-after.png`: Harbor has a left navigation rail, light surfaces, teal network visualization, model statistics, import/export/reset controls, and Network/Learning/Engine tabs. This is an existing screenshot, not a fresh browser run or accessibility audit.
- **Verified browser constraints from documentation:** temporary tab access and scripting permission can support user-initiated page inspection; browser-protected surfaces remain restricted. Cross-origin frames require additional permission and separate handling. Sources appear below.
- **Proposal:** every screen, token, policy, schema, threshold, and interaction in the remainder is a design recommendation unless explicitly marked verified.
- **Hypothesis:** any claim about user benefit, comprehension, trust, adoption, performance, or generalization needs validation. Illustrative counts in wireframes are not measured results.

UX guidance used: `ui-ux-pro-max` skill, including a design-system query for “browser extension accessible productivity.” The result supports flat surfaces, visible focus, short onboarding, reduced motion, and contrast checks. Its marketing-page pattern is a poor fit for an extension and was rejected. System fonts replace its remote font recommendation; the following design is tailored, not a blindly copied generated system.

## What exists versus what the event must build

Treat the current adaptive app as the pre-event foundation, per the assignment. File presence is not an independently established creation date; retain an event-start commit and contribution ledger before claiming provenance publicly.

| Reusable foundation, verified in code | New hackathon work proposed here |
|---|---|
| `src/cssnet/contract.ts`: 18 named cards across home/explore/library | Discover bounded candidate regions and stable identities on unfamiliar pages |
| `src/model/config.ts`: fixed output shape, local model tuning | Variable region configuration with validated bounds and versioned identities; not simply new labels for the existing fixed outputs |
| `src/app/adaptive.ts`: evidence thresholds, blending, hysteresis, generic reorder helper | Safety policy for third-party DOM, semantic order, dynamic pages, and stale proposals |
| `src/app/hold.ts`: freezes a list while mouse/pen is over it; explicitly excludes keyboard/touch holds | Focus, selection, composition, touch gesture, reading, and editing stability |
| `src/model/persist.ts`: IndexedDB model store and saver | Extension-owned site/template storage, scope controls, reliable save status, deletion, and permission-aware restoration |
| `src/app/modelbar.tsx`: import/export, reset, debug, replay | User-readable proposal, preview, transactional apply/undo, and recovery history |
| `src/index.css`: Harbor teal, light/dark accents, reduced-transparency handling; `src/App.tsx`: reduced-motion configuration | Isolated extension surfaces, accessible region inspector, coverage explanations |
| `src/workspace/App.tsx`: Cove channel/message workspace UI | Independent external-page evaluation, not a claim that Cove itself demonstrates universal compatibility |

Do not present Harbor's existing network visualization, fixed-card learning, or replay as newly built. A demo can name them in a short provenance caption, then focus on newly built discovery → Meta-assisted configuration → validated change → recovery. Do not label a local ranker as a Meta model unless that is actually true.

## Product thesis and boundaries

**Hypothesis:** people want important destinations easier to reach, but dislike losing spatial memory more than they value constant rearrangement. Astra should negotiate a small, understandable layout contract and adapt only within it.

Suggested promise: **“Make supported parts of this page work better for you.”** Universal is a direction: a common discovery and policy system across websites, not a guarantee that every page or region can be rewritten.

Start with repeated navigation links and simple independent card groups. Leave forms, checkout, editors, chronological conversations, ordered instructions, live tables, and virtualized lists unchanged unless a specific adapter and its semantics are validated. Use a read-only suggestion when rearrangement is unsafe. Do not automatically hide content in the MVP.

Capability labels: **Available**, **Needs review**, **Left unchanged**, **Unavailable here**. Report “3 candidate groups; 1 available for preview; 2 left unchanged,” not a pseudo-scientific “82% compatible” score. Coverage refers to discovered regions, not the entire unseen page.

## Design principles

1. **A proposal is not permission.** Scanning, sending data to a model, previewing, applying, saving, and future automatic adaptation are distinct decisions with distinct effects.
2. **Preserve the task.** Keep focus, selection, scroll context, input values, browser navigation, and working controls. Never submit, purchase, send, or delete on the user's behalf.
3. **The layout waits for the person.** Collect approved signals without moving a target during use. Offer pending changes at an explicit review point by default.
4. **Explain changes with evidence.** “You opened Saved items several times” is better than “AI optimized your productivity.” Show actual recorded evidence; avoid invented reasons or diagnostic interpretations of pointer behavior.
5. **Expose limits where they matter.** Mark an embedded frame as unchanged on its region card, before preview. Show storage failure before claiming persistence.
6. **Pins outrank predictions.** Explicit preferences take priority over inferred behavior. Undo must prevent the same rejected change from immediately returning.
7. **Separate local learning from remote planning.** Local signal processing does not make a remote configuration request local. State destination and payload beside its action.
8. **Accessibility is a transformation constraint.** A prettier visual order that contradicts reading or focus order is a failed proposal.
9. **Offer a useful no-change result.** “This page is best left as it is” can be a successful scan.
10. **Keep the website recognizable.** Default to one region and modest changes; let users expand scope after a successful preview.

## Surface architecture and state model

Proposed Chromium-first MVP: toolbar entry opens a persistent side panel, supported by an extension-owned settings page and temporary page overlays. Side-panel availability and width behavior need browser-specific validation. A compact popup can show status and launch the primary surface; do not put a long review workflow inside an ephemeral popup.

Side panel target: approximately 360–440 CSS px where supported, responsive down to 320 px. Opening it may itself change page layout; scan the settled viewport and invalidate geometry after resize. Sticky footer must not cover content at zoom. Settings use a wider single-column layout. All scope labels show the current origin, with route detail available on demand.

State flow:

```text
Ready → Inspecting → Proposal → Preview → Applying → Active
           ↓           ↓          ↓          ↓        ↓
        No change    Stale      Cancel     Recovery  Paused

Active → Undo → Previous approved state
Any state → access lost/navigation → Detached or Needs review
Active → save fails → Active · this visit only
```

Every async operation has a cancel or safe exit. Canceling a model request may not cancel provider billing or erase already transmitted data; discard late responses. A tab/navigation generation identifier must prevent old responses from applying to a new page.

## Concrete screens

### 1. First use / onboarding

**Purpose:** explain the benefit and obtain minimum contextual access without demanding broad permissions before value is visible.

Title: “A familiar page, arranged for you.” Three short statements: inspect supported regions; review each change; restore the previous layout. Primary: **Inspect this page**. Secondary: **Try a sample page**. Link: **What Astra can read**.

Start with user-initiated tab access. Explain any browser permission request immediately beside the action. Do not bundle remote model consent into permission to inspect. If the launch page is an extension store or browser settings, replace the primary action with **Open sample page** and explain why.

Goal choice after inspection, not a required survey: **Reach frequent destinations**, **Make content easier to read**, **Choose myself**. These are requested intents, not promises that each page supports all three. MVP can expose only the first and leave other goals in the roadmap.

Completion: one useful region identified or an honest unsupported result. No forced account creation. No background inspection of all tabs.

### 2. Local scan and coverage

Header: origin + “Inspecting layout.” Stage text: “Finding page regions” → “Checking what can change.” Use indeterminate progress unless actual work units are known. Stop control remains available. Proposed slow-state threshold: after 8 seconds offer **Stop and review what was found**; validate this timing.

Result cards contain region name, element count, capability, reason, and **Show on page**. Overlays use numbered outlines linked to the list; they never depend on color or hover. An inaccessible frame is listed as a boundary, not silently omitted.

Empty result: “No supported groups found. This page has not changed.” Actions: **Choose a region** (only if manual selection exists), **Try another page**. Manual selection still goes through the same safety checks.

### 3. Configuration proposal

Before remote request, a disclosure card shows provider/model identity, data categories, excluded fields, and **Inspect request data**. Primary: **Send layout summary and propose**. Default payload proposal: region structure, roles, counts, relationships, bounded geometry and optional approved labels; exclude input values, messages, hidden content, URL query/fragment, and full HTML. Labels can themselves be sensitive: omission or redaction must happen before transport. Screenshots are a separate opt-in, not a hidden fallback.

Proposal summary: “Keep navigation steady. Suggest priorities within Quick links.” Each editable region card shows allowed change, constraints, reason, and review warnings. Controls: include region, rename label locally, pin an item, change adaptation mode. “Details” exposes model configuration without making JSON the main experience.

Configuration contract for implementers:

| Field | Visible meaning / validation |
|---|---|
| Origin, route/template, frame, schema version | Where the recipe may run; never silently widen scope |
| Region identity and evidence | Why this is the intended group; reject ambiguous matches |
| Item identities, output bounds, grouping | Rank only identified members within one approved group |
| Allowed operations | MVP allowlist; no executable model-generated JS or arbitrary CSS |
| Locked items and excluded descendants | User pins and protected controls cannot be overridden |
| Signal policy | Exact local events used; no typed text or raw pointer trajectories by default |
| Update policy and movement budget | Suggest-only by default; deferred movement if explicitly enabled |
| DOM fingerprint / match conditions | Detect incompatible changes rather than trusting saved selectors |
| Validation findings and provenance | Distinguish model inference, deterministic checks, and user edits |

Example summary: “6 links · 2 pinned · suggestions only · saved on this device.” Mark model reasoning as a proposal, not proof of safe semantics. **Preview selected changes** remains unavailable until deterministic validation succeeds; explain the specific failure inline.

### 4. Preview / apply / undo

Use the actual page at the same viewport with **Original / Preview** segmented controls, plus a textual movement list (“Saved: position 5 → 2”). Do not clone active forms or create two live copies of interactive widgets. The initial preview should be an annotated, non-mutating outline/order illustration. An optional live preview may use only operations with a validated rollback path, with site controls blocked from activation during that preview and keyboard access retained to exit.

Persistent banner: “Preview — not saved.” Footer: **Cancel preview**, **Apply for this visit**. “Remember this layout” is a separate unchecked control and does not silently enable automatic changes. Preview timeout or panel closure restores the previous approved state if a live preview was active; the implementation must handle suspension/crash, not rely solely on the panel close callback.

Apply sequence: check that the page still matches → snapshot extension-owned changes → apply bounded operation → verify target/focus/geometry/semantics → commit or roll back. Disable duplicate submissions during apply. Do not display success before verification.

After success: “Applied to Quick links.” Persistent **Undo last change**, **Show original**, **Pause suggestions**. Distinguish restoring the original site presentation from undoing only the most recent extension transaction.

Undo removes only Astra-owned changes. It cannot reverse actions taken on the website or resurrect DOM nodes the website removed. If identity cannot be recovered: “The page changed, so Astra could not restore every position. Astra is paused.” Offer **Remove Astra styling** and **Reload page**; disclose that reload may discard unsaved input and let the user choose it.

### 5. Local adaptation

Active summary: “Suggestions on · this page · learning on this device.” Show only actual events: “4 approved link selections recorded.” No cognitive, health, personality, or intent diagnosis from dwell or tremor.

Default policy: recommendations queue until **Review suggestion**. Optional automatic mode is scoped to an approved region, after the user understands a preview. Local processing must use bounded configuration, not call a remote model on every click.

Proposal for automatic mode: freeze while focus is within the region, pointer is over it, composition/input/selection is active, or a touch gesture is underway. Prefer next visit or explicit acceptance over guessing that a person has finished reading. Bound one adaptation transaction per review opportunity; do not cascade multiple reorderings.

Controls distinguish **Pause learning** (stop collecting), **Freeze layout** (stop changes), and **Turn off for this site** (remove changes and stop collection). MVP may simplify to “Pause Astra” that does both, with exact helper text. An explicit pin is always stronger than learned ranking.

Undo rejects the proposed move for the session, without erasing unrelated preference history. **Forget learned preferences** is a separate action. Show “Not enough activity yet” instead of a fake readiness percentage.

### 6. Persistence / site library

Site rows: origin, approved route/template scope, status, last successful save, recipe version, access status. Details show pins, adaptation mode, learned data categories, and **Forget this site**.

Default: this visit only. Saving means **Remember on this device**. Future automatic restoration is another explicit setting and may require optional host permission; storing a recipe does not itself grant page access. Display **Saved · access needed next visit** when appropriate.

MVP use exact origin and narrow page/template scope; do not key private information by full query strings. Scope by browser profile, with a user-facing reset when site account changes; automatic account separation is unverified. Disable incognito persistence by default until its behavior is tested.

Save acknowledgment follows successful storage completion. Failure: “Applied for this visit, but not saved. Try again.” Do not claim cloud backup or cross-device sync. Export should default to recipe-only without behavioral history, raw URLs with secrets, page labels containing private data, or API credentials. Import must validate schema, scope, and operations and require preview before application.

**Forget this site** lists what will be deleted and disables restoration. A settings view remains accessible even on unsupported pages. Clearing browser storage or uninstalling may lose local preferences; phrase this as local storage behavior, not guaranteed durable backup.

## Wireframes (illustrative content)

```text
FIRST USE                        SCAN RESULT
┌────────────────────────────┐   ┌────────────────────────────┐
│ Astra       example.test   │   │ Astra       example.test   │
│ A familiar page,           │   │ Inspection complete        │
│ arranged for you.          │   │ 1 available · 2 unchanged  │
│                            │   │                            │
│ Inspect → Review → Apply   │   │ 1 Quick links · 6 items    │
│ Undo whenever needed.      │   │ Available   [Show on page] │
│                            │   │ 2 Editor                   │
│ [Inspect this page]        │   │ Left unchanged · input     │
│ [Try a sample page]        │   │ 3 Embedded tool            │
│ What Astra can read        │   │ Unavailable · frame access │
└────────────────────────────┘   │ [Review data to send]      │
                                 └────────────────────────────┘

PROPOSAL                         PREVIEW BESIDE ORIGINAL SITE
┌────────────────────────────┐   ┌────────────────────────────┐
│ Proposal · Quick links     │   │ Preview — not saved        │
│ Prioritize frequent links  │   │ [Original] [Preview]       │
│ [x] Include this group     │   │                            │
│ Keep fixed: Home, Help     │   │ Saved       5 → 2          │
│ Mode: Suggestions only ▾  │   │ Calendar    2 → 3          │
│                            │   │ Home, Help  unchanged      │
│ Why / Limits / Details     │   │                            │
│ 1 selected · 2 unchanged   │   │ [ ] Remember on this device│
│ [Preview selected changes]│   │ [Cancel] [Apply for visit] │
└────────────────────────────┘   └────────────────────────────┘

ACTIVE                           SAVED LAYOUT DETAIL
┌────────────────────────────┐   ┌────────────────────────────┐
│ Active · this visit        │   │ example.test               │
│ Learning on this device    │   │ Scope: /workspace          │
│ 1 suggestion ready         │   │ Saved on this device       │
│ [Review suggestion]        │   │ Automatic restore: Off     │
│                            │   │ Access needed next visit   │
│ [Undo last change]         │   │                            │
│ [Show original] [Pause]    │   │ [Review recipe] [Export]   │
│ [Remember on this device]  │   │ [Forget this site]         │
└────────────────────────────┘   └────────────────────────────┘
```

## Good paths, bad paths, and recovery copy

| Path / trigger | Expected behavior | Copy and next action |
|---|---|---|
| First successful visit | Inspect one group, approve payload, review proposal, preview, apply; no persistence implied | “Applied for this visit.” → Undo / Remember |
| Returning with valid saved recipe | Check permission and identity; restore only with explicit restoration opt-in | “Your saved layout is ready.” → Apply / Review |
| Returning after redesign | Preserve saved preferences, suspend incompatible recipe | “This page has changed. Review a new proposal before applying.” |
| Browser/store protected page | Do not retry injection indefinitely or suggest stronger permissions as a cure | “Your browser does not allow Astra to change this page.” → Open sample page |
| Permission declined or revoked | Leave site unchanged; preserve local recipe without accessing page | “Page access is off.” → Grant access / Keep off |
| Embedded content unavailable | Show partial coverage; leave frame intact | “This embedded area is outside the current access.” → Continue with available areas |
| Model service offline / slow | Preserve scan; no fabricated proposal | “The proposal could not be generated. Your page is unchanged.” → Retry / Review scan |
| Model returns unsafe or invalid config | Reject invalid operations; show no apply action | “This proposal did not pass layout checks.” → Try again / Keep original |
| DOM changes during preview | Cancel affected preview, invalidate apply | “The page changed during preview. Refresh the proposal.” |
| Ambiguous target matches | Never choose an arbitrary element | “We found more than one possible match.” → Choose region / Leave unchanged |
| User types or focuses a target | Queue rather than move | “Suggestion ready. Your layout will stay still while you work.” |
| Website overwrites changes repeatedly | Stop competing mutations and pause region | “This page manages its own layout here. Astra paused this region.” |
| Apply partially fails | Roll back tracked changes, report result honestly | “The change could not be completed. Previous layout restored.” Only use if verified |
| Rollback also fails | Remove safe owned overrides, pause, offer deliberate reload | “Some positions could not be restored.” → Remove styling / Reload page |
| Local save fails | Keep session state, show unsaved status | “Working for this visit; preferences were not saved.” → Retry save |
| Browser closes mid-operation | Recover from durable transaction marker on next attach; revalidate before restoration | “The previous change was interrupted. Review before continuing.” |
| User dislikes adaptation | Immediate undo and suppress repeat proposal for session | “Change undone. We will not suggest that move again this visit.” |
| User wants a complete reset | Explain deletion scope, remove recipe and history for this site | “Forget layout and learned preferences for example.test?” → Forget / Cancel |

Never use a toast as the only recovery location. Keep errors beside the relevant region and in the persistent status area. Avoid blaming the user (“invalid page,” “you denied permissions”).

## Dynamic DOM, trust, and actual browser limits

**Verified constraint:** user-initiated `activeTab` plus `scripting` permits scripting on eligible pages; Chrome access can continue across same-origin navigation but is revoked across origins. This is not blanket or permanent website access. [Chrome activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

**Verified constraint:** privileged browser pages and restricted domains do not accept ordinary content-script injection. Treat unsupported pages as a capability boundary, not a transient failure. Browser-specific restrictions vary. [MDN content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).

**Verified constraint:** `activeTab` covers the top-level origin and same-origin frames; cross-origin frames need additional host permissions. `all_frames` does not mean “bypass restrictions”; frame matching and related-frame rules still apply. [MDN activeTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/activeTab_permission), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Proposed extension mechanism: a content script observes candidate regions, passes a minimized representation to the extension controller, and receives a validated declarative recipe. The model suggests intent and group constraints; a deterministic executor chooses whether any operation is allowed. Treat all page text as untrusted data, including text that instructs the AI to ignore rules. The model cannot expand permissions or authorize code execution.

On mutations, debounce and bound observation work, separate Astra's own writes from site changes, and invalidate affected identities. Re-scan locally before any new remote request; do not upload a fresh page snapshot on every mutation. Navigation, viewport changes, account switches, and virtualization can invalidate a recipe independently of URL changes.

Closed shadow content, canvas applications, virtualized collections, and complex framework-owned DOM are **unvalidated / conservative exclusions for this MVP**, not claims that extensions can never interact with them. Open shadow roots and same-origin frames still require deliberate traversal and independent tests. A frame container's geometry is not evidence that its contents were inspected.

CSS visual ordering can conflict with reading/focus order; moving actual nodes can disrupt framework behavior. Neither technique is universally safe. For the MVP, refuse reordering unless the selected operation preserves semantics and passes an adapter's checks. A fallback suggestion list in the panel may point to existing destinations, but must be labeled a fallback, not a transformed page. Optional later upgrade: vetted site adapters; these are not required for the first constrained demonstration.

## Accessibility and design tokens

Targets are proposed acceptance criteria, not a compliance claim: keyboard completion of every workflow; visible unobscured focus; no color-only statuses; 4.5:1 normal text contrast; 3:1 meaningful UI boundaries and large text; 44×44 px control targets; usable zoom and reduced motion. Verify rendered combinations rather than relying on token labels.

Region picking must have a keyboard list alternative. Escape exits selection or preview and restores focus to its trigger. Use polite status announcements for scan completion and pending suggestions; announce actionable errors without reading every DOM mutation. Do not trap focus in a nonmodal side panel. Modal dialogs return focus correctly. Website keyboard shortcuts remain untouched unless the user configures an extension shortcut.

Never hide the currently focused element. Avoid `aria-live` on the whole page. Preserve accessible names, relationships and logical reading order. Reduced-motion mode uses instant state changes or subtle opacity, no spatial reordering animation; no automatic comparison animation. Respect forced colors and reduced transparency. Do not claim to detect screen-reader use; default policies must already be safe.

Proposed tokens for extension-owned UI only; never globally restyle host pages:

| Token | Light / default | Dark | Purpose |
|---|---|---|---|
| `surface.canvas` | `#F8FAFC` | `#0F172A` | Opaque background |
| `surface.panel` | `#FFFFFF` | `#172033` | Cards and panel |
| `text.primary` | `#0F172A` | `#F8FAFC` | Main copy |
| `text.secondary` | `#475569` | `#CBD5E1` | Help and metadata |
| `action.primary` | `#0F766E` | `#5EEAD4` | Harbor-adjacent teal |
| `action.onPrimary` | `#FFFFFF` | `#0F172A` | Filled action label |
| `status.warningText` | `#92400E` | `#FDE68A` | Review needed, with icon/text |
| `status.errorText` | `#B91C1C` | `#FCA5A5` | Failure, with recovery |
| `border.control` | `#64748B` | `#94A3B8` | Required control boundaries |
| `focus.ring` | `#1D4ED8` | `#93C5FD` | 2px ring with 2px surface gap |
| `space` | 4, 8, 12, 16, 24, 32 px | Same | 16px panel padding; 8px control gaps |
| `radius` | 8px controls, 12px cards | Same | Predictable flat shapes |
| `type` | system UI; body 16/24, metadata 14/20, heading 20/28 | Same | No remote font requirement |
| `motion` | 120–180ms feedback; no automatic motion default | Same | Prototype timing, to test |

Use restrained outlines on the host page with numbered text badges. Keep the extension's status and controls in its trusted surface; a page can visually imitate injected overlays. An isolated styling root prevents many CSS collisions but does not make the shared page DOM a security boundary. Avoid sensitive information in overlay attributes.

## Novel interaction concepts, ranked for a feasible demo

| Concept | Hypothesis and concrete interaction | MVP decision / risk |
|---|---|---|
| **Layout contract** | User approves “rank only these six links; keep Home and Help fixed” in plain language | Core. Makes model output reviewable; test whether users understand scope |
| **Stability pins** | Pin a position from region list; a visible lock says “Astra will keep this here” | Core. Clarify that the website itself can still change |
| **Change receipt** | Each apply records what moved, why, scope, and undo action | Core. More trustworthy than a generic success toast; avoid saving private labels unnecessarily |
| **Adaptation inbox** | Queue suggestions for explicit review rather than rearrange continuously | Core default. May reduce perceived magic; compare against task completion and surprise |
| **Coverage lens** | Numbered regions show available, unchanged, and inaccessible boundaries | Core. Coverage must not look like a whole-page safety certification |
| **Movement budget** | User chooses “Suggest only” or “Small approved changes” rather than a mysterious AI strength slider | Later automatic-mode experiment; establish a measurable displacement bound |
| **Task lens** | Temporary “Reading” or “Frequent destinations” mode without overwriting personal preferences | Later. Prevent competing recipes and scope confusion |
| **Preference passport** | Carry abstract preferences such as larger spacing to a new site, but generate a fresh site recipe | Research only. Never transfer selectors or assume cross-site identity equivalence |
| **Counterfactual explanation** | “Pinned items stay fixed; without the pin this link would move up” | Later. Useful only if computed from real state, not invented by a model |

## Validation questions and release gates

No user testing or extension execution was performed for this contribution. Proposed study: five formative participants including keyboard-only and assistive-technology workflows, then a broader compatibility matrix. Five participants provide directional findings, not universal validation.

1. Can a new user explain what will be read, what will leave the device, and when changes will happen before pressing Apply? Ask them to point to the relevant disclosure.
2. Can they preview, reject one region, apply another, and undo without help? Target at least four of five formative participants; any destructive confusion blocks release.
3. Do pins and queued suggestions preserve spatial memory better than automatic rearrangement? Compare task time, wrong-target activations, and reported surprise against the original page; do not equate more clicks with success.
4. Is the remote planner materially useful compared with deterministic region discovery alone? Compare valid region proposals, manual corrections, and unsafe operations rejected on the same fixtures.
5. Does a “saved” badge correctly predict behavior after navigation, browser restart, permission revocation, and storage failure? Require truthful status in every injected failure case.
6. Can a keyboard user leave preview, recover focus, and access the same items in meaningful order? Test screen-reader order separately from visual order.
7. Do users understand “undo” versus “forget preferences” versus “show original”? Test each as a separate task.
8. Can unfamiliar sites produce useful proposals without hand-authored selectors? Track discovery success separately from safe apply success and from user benefit.
9. Does tab resizing caused by the panel invalidate geometry safely? Test zoom, narrow viewport, sticky headers, and large text.
10. Can a dynamic page rerender, replace a list, or navigate during an outstanding model response without receiving stale changes? Any wrong-page apply blocks release.

Minimum compatibility matrix: ordinary navigation list; static card grid; SPA with route changes; mutation-heavy list; form/editor exclusion; cross-origin frame; protected browser page; zoom/reduced motion/forced colors; permission denial; provider timeout; storage failure; stale import; interrupted preview; undo after target removal. Use owned fixtures for fault injection and permitted external pages for generalization evidence. Report partial support rather than silently dropping failed cases.

Proposed release gates: no unintended website actions; no movement during protected interactions; no stale-response apply; no unapproved data fields in captured network requests; deterministic rejection of executable or out-of-scope model output; successful undo for every supported operation; accessible review and recovery. Performance budgets should be chosen after profiling; no latency promise is established here.

## Event scope and demonstration

**Must build:** extension shell; explicit page access; minimized local region scan; real Meta-assisted declarative proposal with request disclosure; deterministic validation; one safe region transformation; preview/apply/undo; queued local suggestions; truthful per-site save/reset; unsupported and stale states.

**Defer:** automatic cross-site personalization, arbitrary DOM restructuring, full-page redesign, screenshot-based reconstruction, unrestricted custom CSS, shared recipes, and cloud sync. Rich JSON inspection can live under Details; a neural graph is not necessary to understand the benefit.

Suggested three-minute demo, contingent on actual implementation: 0:00–0:20 state the problem and label reused pre-event foundations; 0:20–1:00 inspect an unfamiliar supported page and show boundaries; 1:00–1:35 show actual Meta proposal and user-edited constraints; 1:35–2:10 preview/apply/undo; 2:10–2:40 show local learning yielding a queued suggestion and successful local persistence; 2:40–3:00 show a dynamic-page refusal or protected-page explanation and summarize measured results. Clearly label any fixture, prerecorded evidence, synthetic interactions, or fallback. Use of Meta must be real and auditable, not implied by a mock response.

The strongest UX story is not “AI can move everything.” It is that a model can propose a useful layout contract on a new page, the user can understand and constrain it, and the system can safely decline or reverse changes.
