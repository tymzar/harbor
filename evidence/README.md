# Evidence

Raw outputs of live runs. Each JSON holds the full proposal (plan, validator result, per-call timings and tokens); each PNG is the side panel after the run. Produced by `extension/e2e-tests/live-plan.spec.ts` with `LIVE=1` against the local proxy. Single runs, not benchmarks.

## Day 2 — 28 Oct, owned fixtures

| Page | Mode | Effort | Spark time | Out / reasoning tokens | Groups accepted | Validator errors |
|---|---|---|---|---|---|---|
| docs | DOM only | default | 13.2 s | 3689 / 3169 | 5 | 0 |
| docs | DOM + SAM | default | 14.3 s | 3568 / 3053 | 5 | 0 |
| docs | DOM only | low | 8.7 s | 1747 / 1210 | 5 | 0 |
| catalog | DOM only | default | 15.2 s | 3909 / 3512 | 4 | 0 |
| catalog | DOM + SAM | default | 22.9 s | 5315 / 4918 | 4 | 0 |
| catalog | DOM only | low | 7.8 s | 1651 / 1265 | 4 | 0 |

SAM (4 parallel concepts, 0.9–2.0 s each): docs → one visual group (the 4 "Next steps" tiles, via `rounded rectangle`); catalog → product buttons and cards. `gray box` and `icon` matched nothing on either page.

What this shows and doesn't:
- Every plan passed the validator first time; no repair round was needed. Groups and operations were the same across modes and efforts (card grid → `grid`, docs sidebar → `compact` or `none`, the rest `none`).
- `reasoning_effort: low` halved latency and output tokens with no visible loss on these two pages, so it is now the build default.
- On clean fixture HTML, SAM added nothing the DOM didn't already show. Its value has to be shown on messy real pages (Day 6 comparison), not assumed.
