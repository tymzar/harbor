# Smart Web — hackathon planning handoff

Prepared 27 October 2026. **Planning package; the extension is not implemented.**

Build a **personal layout compiler**: inspect an unfamiliar webpage, use Meta to propose a bounded configuration, preview real changes on the page, and personalize the approved layout locally. Lead with a repeated navigation task on crowded documentation, catalogs and work dashboards. Preserve the user's control through review, pins, stable positioning, pause and restore.

**Working schedule: [Seven-day build plan](docs/hackathon/seven-day-plan.md)** — day-by-day exit checks, Nov 4 as buffer. Live API results: [API probe, 27 Oct](docs/hackathon/api-probe-2026-10-27.md).

## Read in this order

1. [Research and scoring strategy](docs/hackathon/research-and-scoring.md) — event gates, evidence provenance, rubric, Meta API feasibility, pricing assumptions and browser constraints.
2. [End-to-end system plan](docs/hackathon/system-plan.md) — architecture, page graph, configuration contract, execution/rollback, local learning, storage, backend, compatibility, build schedule, evaluation and demo.
3. [Selected UX specification](docs/hackathon/ux-spec.md) — design principles, chosen interaction decisions, screen contract, wireframe, good/bad paths, recovery copy and accessibility.
4. [Technical validation](docs/hackathon/technical-validation.md) and [product validation](docs/hackathon/product-validation.md) — independent reviews and open implementation experiments.
5. Original independent Astra proposals: [product ideas](docs/hackathon/astra-product-ideas.md), [UI/UX ideas](docs/hackathon/astra-ux-ideas.md). These retain alternatives; the system plan and selected UX spec determine the final direction.

## The decisions that matter

| Decision | Selected direction |
|---|---|
| Competition theme | Recommend Build for Your World; final track depends on actual entrant/team status |
| Runtime AI | Meta Muse Spark 1.3 as initial documented candidate; real account access and performance need a build-time probe |
| New contribution | Arbitrary-page discovery, Meta configuration synthesis, extension lifecycle, validator/executor, user review and recovery |
| Existing foundation | Local ranker, CSS inference and adaptive app UI predate the event and must be credited as reused |
| Page changes | Real bounded density/reflow/emphasis in the first slice; generic live-control reordering requires tested adapters |
| Learning | Local, per-site, explicitly enabled; queue suggestions by default; user pins override predictions |
| Learning proof | At least one accepted learned suggestion changes a property on the actual page; learned shortcuts alone do not satisfy this |
| Inference reuse | Start with bundled JS; optional inherited CSS engine runs in extension panel only after parity/collision testing |
| Permissions | Toolbar-triggered current-page access; persistent per-site access only as a separate optional choice |
| Privacy | Review minimized upload; keep provider secret server-side; screenshots optional and separately approved |
| Honest coverage | Capabilities per region; unsupported contexts are explicit; shortcut-only fallback does not prove universal reflow |
| Deadline | November 4, 21:00 Eastern = November 5, 03:00 Zurich; internal ready target November 4, 18:00 Zurich |

The central demo is **new page → grounded configuration → preview → actual page change → useful local personalization → restore**. Show a second distinct page family and a failure/recovery case. Evaluate task outcomes against original and static/pin-only baselines; do not equate model complexity or more movement with benefit.

Independent reviews identified and prompted corrections to closed-shadow-root access claims, preview expiry during interaction, ordered catalog identity, CSS isolation, worker lifetime, upload-consent binding, and the link between learning and actual page changes. The revised plan incorporates these design decisions; build-time experiments remain open and are not represented as completed tests. [Review disposition and requirement coverage](docs/hackathon/verification.md) records the final planning audit.

## Ordered build backlog

[Implementation backlog](docs/hackathon/implementation-backlog.md) translates the selected plan into nine dependency-ordered tickets with owners, acceptance evidence, and the first end-to-end build checkpoint. All tickets remain unimplemented.

## First implementation morning

1. Record the pre-event baseline (`e97c307` is the inspected current head, dated October 23); preserve existing uncommitted work. Confirm exact provenance before public claims.
2. Package a minimal MV3 extension and prove toolbar access, tab identity, side-panel opening and one bounded DOM scan on an owned fixture.
3. Run one authenticated Meta strict-schema configuration request with sanitized fixture data and record model ID, latency and usage. This planning task did not use credits or configure an account.
4. Build the shared proposal schema and deterministic validator before connecting any response to page mutation.
5. Deliver one reversible in-page reflow on an uninstrumented card group, then generalize across the declared corpus. Preserve the original website's task and keyboard behavior.

## Agent provenance and validation status

Two `gpt-6-astra` agents independently produced the product and UX proposals. The requested GPT‑5.6 validator model was not available in the session's model catalog. The user was offered a replacement choice; absent a preference, the two validation agents were launched with the inherited default model, without a model override. These reports must not be described as GPT‑5.6 reviews.

The package distinguishes four kinds of evidence: supplied participant-guide requirements, live official documentation, current source inspection, and untested product/engineering hypotheses. No extension runtime, real Meta call, participant study or market validation has been performed. Existing test reports were not rerun and are not evidence for the planned extension. Source-code and unrelated working-tree files were left unchanged.

After this limitation was disclosed and the goal was blocked, the user asked to continue. We proceed with the completed independent substitute reviews on that basis. GPT‑5.6 was not used; the substitution remains part of the provenance, not a claim about the requested model.

One event question needs resolution before submission: the supplied guide explicitly gives startups an existing-code reuse exception; its application to an Indie entry is unclear. Confirm the actual track and baseline with organizers. This planning task has not contacted anyone or treated the exception as universal.
