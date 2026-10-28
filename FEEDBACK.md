# Meta products — running feedback

Notes for the submission's feedback fields. Add entries as they happen, dated.

## 2026-10-27

- **Docs naming mismatch.** Meta docs use `MODEL_API_KEY`; LiteLLM's Meta provider reads `META_API_KEY`.
- **SAM docs discoverability.** `dev.meta.ai/docs/sam` returns 404; the real pages are `/docs/sam/segmenting` etc., found only through the site's `llms.txt`.
- **SAM empty result is silent.** A zero-match concept returns `status: completed` with empty `output_text` — easy to mistake for a malformed request. A `matches: 0` field would help.
- **SAM on UI screenshots.** `button`, `icon`, `rounded rectangle` work well; `card`, `panel`, `navigation menu` return nothing. Worth documenting for UI/screen use cases.
- **Spark reasoning share.** ~90% of completion tokens were reasoning on a small structured task; positive: strict JSON schema held exactly, directly and via LiteLLM.
- **LiteLLM docs lag.** LiteLLM's Meta provider page still shows `muse-spark-1.1`; `meta/muse-spark-1.3` works.

## 2026-10-28

- **SAM works through LiteLLM.** `meta/sam-3.1` streams through the LiteLLM proxy `/v1/responses` unchanged (11 boxes, same as direct). Not in LiteLLM's Meta docs.
- **LiteLLM auth status codes.** Missing key → 500, wrong key → 400 "No connected db"; both refused, but neither is a 401.
- **Spark latency vs reasoning effort.** Layout plans took 13–23 s at default effort with 85–92% reasoning tokens; `reasoning_effort: low` gave the same plans in 8–9 s on two pages. A per-request latency hint or a faster structured-output tier would help interactive use.
- **SAM non-streaming works.** Plain `POST /v1/responses` (no `stream`) returns the full token text; docs only show streaming.
- **Spark is conservative by default.** On a GitHub repo it returned "no change" for every region, including one its own reason called "low-value". Explicit per-region guidance plus an optional user goal produced 3–4 sensible changes per run, consistent across runs. Instruction-following on structured output is good once the prompt says what "useful" means.
