# Live session: "methodical" persona

**Question:** how quickly does adaptation start for a calm user with a stable routine, and how steady is it once it starts?

**Short answer:** the suggestion panel adapts very fast and stays steady. It was correct from interaction #6 onward and right on 93% of routine steps. The adaptive grid moves more than this user wants. Because the grid is ordered by "what comes next", a fully predictable 5-step routine moves the grid around forever: 40 moves in 127 interactions, and in about half of my grid clicks the target was in a different slot from the one I'd last seen it in. The run also found three bugs: a lost training example on reload, the grid order not persisting, and search being counted twice.

Everything below was measured in a single headless Chromium 156 run on GPU (ANGLE Metal, Apple M2 Pro), seed 20261022, with the `calc` engine. Separate repro scripts confirmed the bugs. Anything not measured is marked *assumed*.

## Method

- **Driver:** [`session.mjs`](session.mjs) uses headless Playwright Chromium (`--use-angle=metal`, the same as the e2e config), a 1280x800 viewport and a dev server on port 5181.
- **Human-like input:** every action is a `page.mouse` approach along an eased, curved Bezier path, with 14–48 steps of 9–17 ms. 25% of approaches overshoot by 3–8 px and then correct.
  - Hover dwell is 387–883 ms with at most 1 px of tremor. Presses are 141–260 ms.
  - Think time is 1.2–2.6 s after opening a card and 0.45–1.5 s otherwise. A wheel scroll happens 8% of the time.
  - Search is a click on the field, then select-all, typing at about 150 ms per character, and Enter.
  - Before pressing, the driver checks whether the target moved during the hover. If it did, it re-aims, as a careful person would.
- **Routine:** home → explore → open-card → favorite → share, repeated for 26 cycles.
  - From cycle 3, each cycle had about a 20% chance of a deviation: a search after open, a library detour, a compact-mode toggle, or skipping favorite. 6 deviations happened.
  - After 9 of the last 10 suggestions were correct, the user sometimes clicked the suggestion itself (20% chance). This happened 11 times.
  - The page was reloaded once, after interaction 72 ("coming back later").
- **Sampling:** before and after every interaction the driver read `stats()`, `ranking()`, `cssOutputs()`, `jsOutputs()`, `latencies()`, plus `markov()`, `blended()`, `alpha()`, `gridOrder()`, the order of the grid and suggestion list in the DOM, and the features. All of this is in [`trace.json`](trace.json); the console output is in [`run.log`](run.log).
- **How a prediction is scored:** each prediction is the state *before* the action, i.e. what the user saw when deciding.
  - "Suggestion" is the top item in the DOM suggestion list.
  - "Markov" is the argmax of `markov()`; "MLP" is the argmax of the CSS-computed `cssOutputs()`.
  - Metrics come from [`analyze.mjs`](analyze.mjs) and are written to [`metrics.json`](metrics.json).
- **Video:** after the run, the persisted IndexedDB state (127 examples) was loaded into a new context with `recordVideo` for two more routine cycles: [`session-trained.webm`](session-trained.webm) (21.6 s). The grid moves can be seen in it.

## Metrics

| Metric | Value |
|---|---|
| Interactions | 127 (121 routine, 6 deviations) |
| First visible adaptation | **#6**: the suggestion's top item changed from the prior (Open) to Explore, and was correct |
| Correct streak | from #6, 10+ correct suggestions in a row (in fact 19, #6 to #24, until the first deviation at #25) |
| First grid reorder | #23 (cold-start guard plus EMA hysteresis) |
| Suggestion top-1, all / routine only | 0.88 / **0.93** |
| Markov top-1, overall (my count) | 0.89 |
| MLP (CSS) top-1, overall (my count) | 0.71 (0.05 in #0–19, 0.60 in #20–39, 0.85–0.95 from #40) |
| `stats()` rolling-20 at the end, Markov / MLP | 0.75 / 0.70 (pulled down by 2 deviations in the last 7 and by the search double-count) |
| Deviations predicted | 0 of 6 (expected: none were in the routine) |
| Suggestion correct on the step after a deviation | 2 of 6 |
| Click-to-pixel latency, p50 / p95 / max (n=127) | **27.2 / 34.3 / 43.9 ms** |
| Double-rAF latency, p50 / p95 | 42.5 / 49.7 ms |
| Largest CSS vs JS difference during the session (calc) | **4.5e-6** |
| CSS vs JS on the final weights, calc / hybrid / animation | 2.9e-6 / 2.9e-6 / 2.9e-6 (all `cssnet`, none on the fallback) |
| Grid moves (layout moves) | **40** in 127 interactions; 0 in #0–19, then 5, 9, 6, 8, 9, 3 per 20 interactions |
| Grid clicks whose target was in a different slot from the user's last click | 37 of 76 |
| Targets that moved *during* the hover | 0 |
| Missed clicks | 0 |
| Clicks made through the suggestion panel | 11 (all registered as one example each) |
| Console errors or warnings | 0 |

What each window looked like (20 interactions each):

| Window | Suggestion | Markov | MLP | Grid moves | MLP weight at end |
|---|---|---|---|---|---|
| 0–19 | 0.75 | 0.75 | 0.05 | 0 | 0.38 |
| 20–39 | 0.90 | 0.90 | 0.60 | 5 | 0.52 |
| 40–59 | 0.90 | 0.95 | 0.85 | 9 | 0.60 |
| 60–79 | 1.00 | 0.95 | 0.95 | 6 | 0.65 |
| 80–99 | 0.95 | 0.95 | 0.95 | 8 | 0.68 |
| 100–119 | 0.85 | 0.90 | 0.85 | 9 | 0.70 |
| 120–126 | 0.71 | 0.71 | 0.71 | 3 | 0.71 |

## Timeline

- **#0, cold start:** [01-cold-start.png](01-cold-start.png). The prior suggests Open, Home, Explore, Library. The grid is in its default order.
- **#2:** the suggestion is "correct" for open-card, but only because Open is the top of the prior. I don't count this as adaptation.
- **#6, first adaptation:** [02-first-adaptation.png](02-first-adaptation.png). On my second pass through the routine, Explore was suggested before I clicked it. From here the suggestion was right 19 times in a row.
- **#10:** the MLP is right for the first time. It stays mostly wrong until about #22, while Markov does the work. The blend weight (MLP 0.26 at #10) keeps this from showing.
- **#23, first grid move:** share jumps to slot 1 after I favourite. Then a pattern starts and never stops:
  - after nav-explore, open-card goes to slot 1;
  - after open-card, favorite goes to slot 1;
  - after favorite, share goes to slot 1.

  So the card I'm about to click has usually just slid into the top-left corner. Moves per cycle rose to 2–3 by #60 (#63, #64 and #66 are three moves in one cycle).
- **#25, compact-mode deviation:** predictably missed. On the next step (#26 home), the suggestion said Favorite.
- **#58–59, library detour:** after library → open-card, the suggestion said Home (wrong), while Markov alone would have said open-card (right). The MLP (weight 0.60) overrode a correct Markov.
- **#60:** [03-mid-session.png](03-mid-session.png).
- **#72, reload:** [04-after-reload.png](04-after-reload.png).
  - The example count went from 72 to **71**, so the last `share` was lost.
  - The grid went back to its default order (`favorite,open-card,share,...` became `open-card,favorite,share,...`).
  - The suggestion became ambiguous (Home 51%, Share 35%), because the model now thinks my last action was favorite.
  - The compact-mode toggle also reset (that setting is UI state only, never persisted).
- **#85 and #115, skipped favorite:** both missed, and the routine recovered on the next step.
- **#111–112, compact-mode toggle again:** on the next step (home) Markov was right, but the blend suggested Favorite. Same override problem as #59.
- **#124, search:** [weird-double-count-124.png](weird-double-count-124.png). One search (click the field, type "field notes", Enter) produced **2 training examples**. The model then learned search → search: Markov gave search 0.56 as the next action. On the next step, favorite ranked 7th of 8 and the suggestion said Home. This, plus the deviations, is why the final rolling accuracy is 0.75 / 0.70.
- **#126, end:** [05-end.png](05-end.png), and with the debug drawer open: [06-end-debug.png](06-end-debug.png).

## How it felt, in the persona's voice

> I do the same five things every morning. The "Suggested next" panel had my routine down by the second lap. After that it was right almost every time. It was a little like a colleague who says "share, right?" before I reach for the button. It was **helpful, not creepy**: it only reflects what I just did, and the percentages make that clear. Once I trusted it, I used it as a shortcut now and then (11 times), and it never let me down.
>
> The grid I did not like. Once the app "learned" me, around the fifth lap, the cards started swapping places on nearly every lap. Two or three times per lap, the card I wanted next had just slid into the top-left corner. Each move was small and smooth, and nothing ever moved under my cursor while I hovered. But I work from muscle memory, and half my clicks needed a fresh look to find the button. Being more predictable made the layout *less* stable, which is backwards for someone like me. I'd call it **jumpy**: not broken, just restless. I would turn it off, or want it to settle into one fixed order that suits my routine.
>
> When I came back after a reload, the layout had forgotten its arrangement, and the suggestion wavered for a moment. I searched once and it got confused for two steps. A careful user notices both.

(The feelings are my reading of the measured behaviour. Nobody tested this with real people.)

## Bugs found

1. **The last training example is lost if the page is reloaded or closed within about 1 s of an action.** Tested in the session (#72: 72 became 71) and in a repro.
   - **Repro:** fresh context, reset, click home, explore, open-card, favorite, share, home (1.2 s apart), then reload after a delay. Measured:
     - 200 ms delay: 6 became 5
     - 600 ms: 6 became 5
     - 1500 ms: 6 stayed 6
     - 2500 ms: 6 stayed 6
   - **Cause:** this matches `SAVE_DEBOUNCE_MS = 1000` in `src/model/config.ts` with no flush on `pagehide`/`visibilitychange`. *Assumed*: I didn't trace the code path. A grep of `src/model` found no pagehide or visibilitychange handler.
   - **Effect:** after a reload, Markov's previous-action context is wrong, and the suggestion wavers.
2. **The grid order is not persisted, so the layout jumps on every reload.** Tested.
   - **Repro:** 6 fast routine cycles, wait 1.5 s, reload. Before: `share,open-card,favorite,search,settings`. After: `open-card,favorite,share,search,settings`.
   - `gridOrder` and `gridScores` live only in controller state (`initialState()` in `src/app/controller.ts`).
3. **One search is counted as two actions when Enter comes more than 1.5 s after the click into the field.** Tested in the session (#124) and in a repro with `page.mouse`.
   - **Repro:** reset, then click the field:
     - click only: 1
     - click, Enter after 300 ms: 1
     - click, Enter after 2000 ms: **2**
     - click, type "moss" at 150 ms per character, Enter: **2**
   - **Cause:** in `GridCard`, both the click on the input and `onSubmit` call `doSearch`, and the only dedup is a 1500 ms window. Anyone who types a real query takes longer than 1.5 s.
   - **Effect:** a fake search → search transition. Next-step accuracy dropped, and the real next action ranked 7th of 8.
   - **Caveat:** in one earlier variant using `locator.click()` instead of `page.mouse`, click + type for 1.9 s + Enter gave 1, not 2. I didn't investigate why.
4. **Design issue: the grid rotates forever on a stable routine.** Measured. The previous agent's notes already list this for a 3-action cycle; this run quantifies it for a 5-step routine.
   - From #23 on there were 40 moves, at a steady 6–9 per 20 interactions, with no settling at all by #127.
   - Ordering by an EMA of the *next-action* distribution means the order follows your position in the cycle, so a perfectly predictable user gets perpetual motion.
5. **The blend lets a confident but wrong MLP override a correct Markov after a deviation.** Measured twice: #59 (MLP weight 0.60) and #112 (0.69). Markov was right and the suggestion was wrong. The reverse happened once (#72, right after the reload). Minor, but the MLP weight keeps rising with the example count (0.71 at the end) whether or not the MLP is the better predictor.

## Suggestions

- **Persistence:** flush the save on `pagehide` and on `visibilitychange` to hidden, or save immediately when the debounce timer is pending at unload. Also persist `gridOrder` and `gridScores` with the model.
- **Search:** count a search once per focus session. For example, count on submit only, or on click only if nothing is submitted within N seconds, or dedup on "same field, no blur in between".
- **Grid for routine users:** order by a slower *frequency* signal, such as a long-horizon EMA of the action marginals rather than the next-action distribution. Or add a cooldown, e.g. at most one move per N interactions or per session. Or lock the layout once the order has been the same for K cycles. Leave "what's next" to the suggestion panel, which already does it well. Expected result: for this persona the grid would settle on open-card, favorite, share and then stop moving. *Assumed, not tested.*
- **Blend weight:** set the MLP weight from recent relative accuracy (e.g. a rolling log-loss of each predictor) rather than from the example count alone.
- **For the next test round:** a run in which the user relies on the suggestion panel much more than 11 of 127 times, to see whether clicking a suggestion reinforces the model's own predictions (a feedback loop). Untested.

## Files

- [`session.mjs`](session.mjs): the driver. Run it from the repo root with `node reports/sessions/methodical/session.mjs`, with a dev server on 5181. Options: `N`, `SEED`, `VIDEO=0`, `BASE`.
- [`analyze.mjs`](analyze.mjs) computes [`metrics.json`](metrics.json) from [`trace.json`](trace.json).
- [`run.log`](run.log): the per-interaction console output.
- Screenshots: `01`–`06`, plus `weird-double-count-124.png`.
- Video: `session-trained.webm`.
