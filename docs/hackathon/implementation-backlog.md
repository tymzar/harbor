# Implementation backlog

Ordered work for the approved planning direction. These are build tickets, not completed features. The [system plan](system-plan.md) and [selected UX specification](ux-spec.md) define the contracts. Roles can be performed by one builder; they do not assume a staffed team.

## Critical path

`B01 → B02/B03 → B04 → B05 → B06 → B07 → B08 → B09`

B02 and B03 can proceed independently once baseline ownership is settled. Avoid expanding the operation set before the first complete scan → Meta configuration → actual page change → restore loop works.

| Ticket / owner | Concrete work | Completion evidence |
|---|---|---|
| B01 · Lead · provenance and access | Inventory baseline commit and uncommitted files without discarding them. Create new/reused/extended contribution ledger. Confirm chosen track's reuse rules and model account access. If access is unavailable, use explicitly labeled fixtures for development and retain the live-call gate. | Baseline ledger and exact unresolved organizer/account questions. No claim that inherited code is event-created. |
| B02 · Extension · shell and sessions | Add separate extension build entry, MV3 manifest, toolbar handler, side panel, main-frame packaged extractor bootstrap and tab/document session identity. Permissions are activeTab, scripting, sidePanel, storage and backend-only host access. | Fresh-profile unpacked install; toolbar activation; same/cross-origin navigation; tab switching and restricted-page states. Existing app remains independently runnable. |
| B03 · Contract · configuration schema | Implement page-map/proposal/transaction types, strict provider-compatible schema, bounded operations and semantic validator. Distinguish transient node IDs from persistent catalog identities. | Invalid IDs, unsafe values, protected regions, duplicate/empty groups, unknown fields, oversized plans and stale revisions rejected. Accepted example compiles to a finite transaction. |
| B04 · Extraction · unfamiliar-page graph | Implement chunked discovery, candidate grouping, sensitive exclusions, local registry, manual region correction and mutation/resize invalidation. Use independently labeled docs/catalog/dashboard fixtures. | Two different page families discovered without app-specific IDs; truncation and unsupported areas visible; natural semantic traps rejected or routed to review. |
| B05 · Integration · actual Meta proposal | Implement authenticated fixed-endpoint proxy, reviewed immutable payload hash, exact schema request, cost reservation, server deduplication and bounded repair. Preserve scan through login; revalidate before upload. | One real authorized request with model ID, redacted usage and timing; wrong-tab, substituted payload, stale approval, auth/quota/timeout and malformed-response paths verified. |
| B06 · Runtime/UX · preview, apply, restore | Implement order-preserving density/grid/emphasis only. Outline review precedes live preview. Record owned mutations, guard interaction, implement expired-pending-restore and report partial rollback truthfully. | Actual in-page transformation on two page families; original tasks still work; cancel, expiry during pointer-down, host mutation, removed node and panel closure tested. |
| B07 · Learning · preference-to-page trace | Add activation-only adapter and local catalog ranker, queued suggestions, pins, pause and rejection suppression. Start with JS inference. Implement visit-only state and explicitly opted-in acknowledged storage. Reset incompatible ordered mappings. | Actual observations cause a queued learned change that, after acceptance, changes an approved property on the page. Native keyboard/pointer activation counted once; synthetic actions excluded. Saved/unsaved status truthful. |
| B08 · Evaluation · evidence and hardening | Run corpus, fault and access-method matrix; compare native, static/pinned and learned conditions including setup costs. Fix blockers before adding optional features. | Results with denominators, failures, abstentions and machine/browser details; 400%/spacing/AT gaps explicitly recorded. Human studies reported only if actually performed. |
| B09 · Release · judge-ready demonstration | Freeze features, rehearse three-minute story, document install and limitations, prepare public source and contribution diff. Validate links and roster before authorized submission. | Reproducible clean install, real configuration trace, learned in-page effect, second page family, recovery, and provenance all visible. Publication/submission are subsequent user-authorized actions. |

## First build checkpoint

The first meaningful checkpoint is B02–B06 on one owned but uninstrumented fixture: invoke extension, inspect structure, review data, receive a real Meta plan, validate it, preview actual card-grid reflow, apply, use the original link, and restore. A mock request can unblock development but cannot close this checkpoint. A panel-only result cannot close it either.

The next checkpoint adds a held-out page family and B07's learned in-page change. Only then broaden coverage. If a constraint forces a narrower demo, record the shortfall against the full vision instead of redefining the objective.

## Test ownership and what not to count

B03 owns pure contract/validator tests; B04 owns semantic discovery fixtures; B06 owns transaction and browser lifecycle tests; B07 owns catalog identity, observation and storage tests. B08 runs integrated scenarios that cross those boundaries. Add extension-specific test commands during implementation and document them; existing app tests cannot stand in for extension tests.

Keep fixture replay, live provider calls, scripted browser checks and human outcomes separate in the evidence directory. Every result needs page/state identity, code revision, configuration version, execution mode and timestamp. No test may silently replace an unavailable live integration with a cached result and still call itself live.

## Optional work after the core passes

Screenshot-assisted disambiguation, CSS inference in the extension panel, open-weight provider experiments, automatic region adaptation, recipe sharing, cross-site preferences and additional browser adapters remain optional or later-phase work. Each requires its own evidence gate in the system plan. They must not consume the final integration and recording buffer.
