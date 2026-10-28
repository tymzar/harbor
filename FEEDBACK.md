# Meta products — running feedback

Notes for the submission's feedback fields. Add entries as they happen, dated.

## 2026-10-27

- **Docs naming mismatch.** Meta docs use `MODEL_API_KEY`; LiteLLM's Meta provider reads `META_API_KEY`.
- **SAM docs discoverability.** `dev.meta.ai/docs/sam` returns 404; the real pages are `/docs/sam/segmenting` etc., found only through the site's `llms.txt`.
- **SAM empty result is silent.** A zero-match concept returns `status: completed` with empty `output_text` — easy to mistake for a malformed request. A `matches: 0` field would help.
- **SAM on UI screenshots.** `button`, `icon`, `rounded rectangle` work well; `card`, `panel`, `navigation menu` return nothing. Worth documenting for UI/screen use cases.
- **Spark reasoning share.** ~90% of completion tokens were reasoning on a small structured task; positive: strict JSON schema held exactly, directly and via LiteLLM.
- **LiteLLM docs lag.** LiteLLM's Meta provider page still shows `muse-spark-1.1`; `meta/muse-spark-1.3` works.
