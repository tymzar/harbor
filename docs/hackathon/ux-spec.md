# Smart Web: selected UX specification

This is the selected design contract, synthesized from the two Astra proposals. It overrides conflicting alternatives in the ideation documents. All behaviors are planned; no extension UI has been built or user-tested in this planning task.

## Decisions resolved during synthesis

| Question | Selected behavior | Why |
|---|---|---|
| Product versus model name | Product is Smart Web; Meta Muse Spark is the page planner; Astra is an ideation-agent model only | Avoid making a non-Meta runtime claim in a Meta hackathon |
| Default adaptation | Suggestions queued for review; automatic small changes are a later explicit region-level opt-in | Predictability is the default; local learning still produces real personalization |
| Actual layout scope | Density, card-grid reflow and emphasis on approved page regions in the hackathon slice | A sidebar alone would not meet the requested smart-page-layout goal |
| Generic reordering | No generic reordering of live interactive page subtrees | Browser focus order and host application assumptions need adapter-specific evidence |
| Preview | Start with numbered outlines and change descriptions; explicit Preview on page applies a reversible provisional transaction | User sees actual layout effects without confusing an annotation with a working transformation |
| Interaction during live preview | Freeze learning; preserve website operation; clear preview status and persistent Cancel/Apply in the panel | Do not blanket-block website controls with overlays or create inaccessible duplicate widgets |
| Preview exit | Cancel requests safe restore; scoped Escape exits extension controls; expiry disables Apply and restores at a safe interaction boundary | Expiry must not move a pressed target; panel closure is not a reliable sole cleanup signal |
| Saving | Apply for this visit first; Remember on this device is separate and unchecked | Stored recipe and permission for future access are different things |
| Account | Local scan/sample can work before login; remote proposal requires authenticated demo/product access | No fake promise that an unprotected public backend can safely hide a provider key |
| Hiding | No automatic hiding in the hackathon slice; user-approved modest emphasis or dimming only with checks | Important context and controls must remain discoverable |
| Extra modalities | Screenshot explicitly optional; voice, generated visuals and full-page reconstruction deferred | Core value does not depend on expensive or sensitive payloads |

## Design principles

1. Preserve the user's task: focus, selection, scroll context and original working controls matter more than visual novelty.
2. Make scope visible: name the current site, region, operation and whether a change lasts this visit or is saved.
3. Give the user an effective veto: pins override ranking; Undo suppresses the rejected suggestion for the visit; Pause stops collection and changes.
4. Explain from actual evidence: “You pinned Reference” or “This group contains six destinations,” never invented psychological explanations.
5. Separate local and cloud work: label what is inspected locally, what is sent, and when a Meta proposal is being generated.
6. Keep movement predictable: queue by default, never move a target during protected interaction, offer a stable mode without needing disability disclosure.
7. Treat uncertainty as product state: “Needs review,” “Left unchanged,” and “Unavailable here” are useful outcomes, not hidden failures.
8. Preserve accessibility relationships: visual improvement cannot justify broken reading order, labels, keyboard operation or focus.

## Screen inventory and interaction contract

The main surface is a Chromium side panel, targeting 360–440 CSS px and remaining usable at 320 px and 200% zoom. Scan after the panel settles because opening it changes the page viewport. Website highlights are numbered, non-intercepting outlines; trusted controls remain in extension UI. A page can imitate overlays, so never place secrets or authentication controls there.

| Screen | Content and main action | Exit / failure behavior |
|---|---|---|
| Ready | Current site; “Arrange this page for your task”; Inspect page / Try sample | New tab without access: “Click Smart Web in the browser toolbar to allow this page” |
| Scan | Stage labels; Stop; bounded candidate-region list; capability and reason per region | Empty or partial scan is explicit; no fake compatibility percentage |
| Data review | Exact sanitized request preview; provider/model; excluded categories; optional image reviewed separately | Local-only path remains usable; rejected upload leaves page unchanged |
| Goal and proposal | Choose task; selected regions; allowed changes; protected areas; concise reasons; editable inclusion/pins | Invalid or stale proposals cannot be previewed; region correction regenerates affected plan |
| Outline review | Numbered page overlays and plain-text change receipt | Keyboard region list offers equivalent selection; Escape exits picker |
| Live preview | “Preview on — temporary”; Original/Preview toggle; change list; Cancel / Apply for this visit | Expired preview disables Apply, then restores at a safe boundary; late model results ignored |
| Active | Region count; local learning status; Review suggestion; Undo; Show original; Pause | Save error says “Applied for this visit, but not saved” |
| Site settings | Narrow scope; saved recipe; permissions status; retention; delete/reset; optional future auto-restore | Forget removes recipe/history and disables future restoration; acknowledge completion |

Do not bury the primary action beneath a large prompt composer. Start with three concrete intents: Find destinations, Comfortable reading, Choose a region. Offer only intents supported by the current page. A small optional task field refines intent without being required.

## Wireframe: the central proposal

```text
┌──────────────────────────────────────┐
│ Smart Web             docs.example   │
│ Review your layout                   │
│ Task: Find reference sections        │
│                                      │
│ 1  Reference cards       Available   │
│    6 destinations · original order   │
│    [x] Comfortable two-column grid   │
│    [x] Emphasize your pinned item    │
│    [Show region] [Adjust selection]  │
│                                      │
│ 2  Article            Left unchanged │
│    Paragraph sequence is preserved.  │
│                                      │
│ Suggested by Meta Muse Spark         │
│ [Why these changes] [Configuration]   │
│                                      │
│ [Cancel]        [Preview on page]    │
└──────────────────────────────────────┘
```

Illustrative data only. This wireframe deliberately shows real page reflow rather than claiming that a shortcut shelf is a transformed page. Learning can later suggest which approved item receives emphasis or which destination leads in the extension-owned list. The UI must identify where each change occurs.

The hackathon acceptance gate requires at least one learned suggestion that the user accepts **on the actual page**, such as emphasizing a preferred card. Learning that only changes the extension destination list is supplementary and cannot satisfy the full adaptive-page claim. Show actual supporting observations and identify initial layout changes separately from learned changes.

## Good paths

**First useful layout:** toolbar click → local scan → choose a task and region → inspect outgoing data → generate proposal → correct any grouping → outline review → live preview → apply → complete the original website task → optionally enable local learning and save. Success means original controls still work and the user understands the change, not simply that a model returned JSON.

Shortest path uses a sensible task/region recommendation with editable defaults and one data-review screen; details remain expandable. If sign-in is needed, preserve the local scan through authentication or cancellation, then revalidate page/viewport and request renewed data review before upload. Login completion never sends automatically. Expired auth offers Sign in, quota exhaustion explains the limit, and offline offers a saved local recipe; do not send all three into an identical Retry loop. Measure setup time and abandonment, including this interruption.

**Returning to the same site:** check access → re-identify the saved catalog → show “Saved layout ready” → apply or inspect changes. Auto-restore runs only if separately enabled and the identity checks pass. If access is absent, retain the saved recipe and request a fresh toolbar gesture. A saved badge never implies persistent permission.

**Learning without surprise:** enable local learning → deliberately use approved destinations → a suggestion appears with actual supporting counts → review → accept or reject → update within the approved family. Pin beats learned preference. Rejecting a move does not erase all useful history.

**Keyboard-first use:** toolbar shortcut → panel controls in logical order → region list instead of hover picking → preview → Escape or Cancel → focus returns to the prior reachable control. Review suggestions rather than moving content during keyboard focus. Screen-reader checks must be manual as well as automated.

Focus restoration applies when the extension owns the interaction; do not steal focus back if the user intentionally moved to the website. Scope Escape so a website menu/dialog handles its own dismissal. Preview expiry enters “Preview expired — restoring when you finish this interaction,” disables Apply and learning immediately, and waits out active pointer/selection/focus-sensitive geometry changes. Content-side cleanup is best effort under suspension and rechecked on resume. Explicit Cancel has priority over new proposals but must not move a pressed target mid-gesture. Website actions taken during preview cannot be undone by layout restore.

## Bad paths and recovery

| Trigger | Required outcome | User-facing copy |
|---|---|---|
| Protected browser page | Stop injection attempts; offer sample/another page | “Your browser does not allow changes here.” |
| Different tab lacks access | Clear old site's controls; never apply old proposal | “Allow this page from the Smart Web toolbar button.” |
| Sensitive or inaccessible region | Explain exclusion before upload/preview | “This area will stay unchanged.” |
| Wrong semantic group | User edits selection; validator reruns | “Choose which items belong together.” |
| Model timeout / temporary failure | Preserve scan, no mutation; bounded retry | “No proposal was applied. Try again or keep the original.” |
| Expired authentication | Preserve scan; sign in, then revalidate and review upload again | “Sign in to request a proposal. Your page is unchanged.” |
| Quota or spend limit reached | Stop automatic retries; explain limit and local saved option | “Proposal limit reached. You can still review a saved layout.” |
| Invalid generated configuration | Reject; bounded repair once; otherwise stop | “This proposal did not pass layout checks.” |
| Layout/route changes while waiting | Invalidate request and provisional changes | “The page changed. Review a fresh proposal.” |
| User types, selects, scrolls or opens menu | Freeze automatic adaptation | “Suggestion ready when you want to review it.” |
| Apply fails | Roll back owned changes; verify result | “The change could not be completed.” Add “Previous layout restored” only if true |
| Partial rollback after host mutation | Remove owned styles, pause, offer user-controlled reload | “Some changes could not be restored because the page changed.” |
| Storage fails | Keep current visit usable; do not show saved | “Applied for this visit, but not saved.” |
| User dislikes result | Undo and suppress recurrence for this visit | “Undone. We will not suggest that change again this visit.” |
| Provider unavailable offline | Allow reviewed valid saved recipe locally; no fresh-analysis claim | “Offline. You can review your saved layout.” |
| Account changes within same origin | Freeze before reuse when detectable; user reset available | “Review this site's saved preferences for the current account.” |

Automatic account-switch detection is not guaranteed. Do not persist message or account content; use this-visit-only mode for private multi-account workflows until separation is tested. Errors remain visible beside the relevant region, not only in short-lived toasts.

## Visual system and accessibility

Use the Astra UX proposal's light/dark token table: neutral opaque surfaces, teal action, blue focus ring, system fonts, 16/24 body, 14/20 metadata, 20/28 headings, 4/8/12/16/24/32 spacing, 8 px control radius and 12 px cards. Keep host styles scoped to approved transformations. No remote fonts, global resets, decorative neural graph, or automatic animated comparisons in core setup.

UI/UX Pro Max returned a marketing “Product Demo + Features” structure twice; that structure is not a suitable extension pattern and is rejected. Flat surfaces and accessible controls are useful guidance; the side-panel layout is a tailored design decision, not a verified database match. Existing Harbor teal informs continuity but does not constrain host-page branding.

Proposed rendered checks: 4.5:1 normal-text contrast, 3:1 relevant large text/UI boundaries, visible unobscured focus, no color-only status, keyboard access to every action, 44×44 px targets where practical, forced-colors support, and usable 200% zoom. The 44 px target is a product target; [WCAG 2.2](https://www.w3.org/TR/wcag/) distinguishes its enhanced target-size criterion from the 24 px minimum with exceptions. Do not claim certification from these tokens.

Static sRGB contrast calculations were performed for ten specified text/background pairs: light primary 17.85:1, secondary 7.58:1, action 5.47:1, warning 7.09:1, error 6.47:1; dark primary 15.55:1, secondary 10.96:1, action 12.07:1, warning 13.06:1, error 8.57:1. These pass the planned normal-text threshold for these pairs only. Transparency, overlays, disabled states, focus rings and actual rendered host-page combinations remain untested.

Use native labeled controls. Region status is text plus icon; polite live announcements summarize completion, not every mutation. Side panel is nonmodal and must not trap focus. Confirmation dialogs restore focus. Reduced motion removes spatial animations; optional feedback transitions are approximately 120–180 ms. No automatic inference about screen-reader usage or a user's medical state.

Expand rendered checks to 320 CSS-pixel equivalent reflow/400% desktop zoom where applicable, plus simultaneous line-height 1.5×, paragraph-spacing 2×, letter-spacing 0.12× and word-spacing 0.16× overrides. These are resilience tests rather than required default typography. Test Chrome/macOS/VoiceOver and Chrome/Windows/NVDA where available, explicitly recording unavailable combinations. Include reading-position continuity when focus stays in the panel and the host region changes. Any dimming must preserve required text/control contrast. See primary W3C links in [product validation](product-validation.md).

## Experience validation

Recruit 5–8 formative participants if available, including keyboard and assistive-technology workflows where consent and access permit. Ask users to explain data flow and scope before applying; preview one region, reject another, undo, save, revisit and delete. Aim for at least 80% unassisted completion while treating any destructive confusion as a blocker. Small-sample findings are directional and should include individual outcomes and failed attempts.

Compare original, static manual/pinned, and learned layouts; randomize task order to reduce practice effects. Measure task completion, wrong-target activations, setup cost, surprise, restoration success and willingness to keep the change. A faster successful run cannot cancel out a broken control. Track setup cost separately from repeat-use savings. Tests and participants are planned, not completed.

Include native page search/bookmarks as realistic alternatives; report per-person paired outcomes, all failed attempts, auth/correction overhead and repeat-use break-even only when net savings are positive. Annotate expected protected/eligible regions independently before model evaluation. Explicit precedence is protected constraints → user choices → current task → learning. Unpin removes the lock without auto-applying pending movement. Revisit with a changed task to test stale preferences.
