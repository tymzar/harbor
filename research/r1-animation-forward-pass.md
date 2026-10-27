# R1 — Can the ENTIRE forward pass run in the CSS animation engine, with no JavaScript between layers?

**Answer: yes.** Tested in headless Chromium 156.0.8078.4 (Playwright 1.64.1, macOS) on 2026-10-22.

The known blocker — an animated custom property is *animation-tainted*, so `var()` of it inside any
`animation-*` property resolves to 0 — is real (re-confirmed, including through inheritance). But the taint
is a rule about **custom properties substituted by `var()`**. It does not follow a value that leaves the
custom-property world. Four laundering channels were found that work, three of them synchronous:

| bridge | mechanism | tainted? | synchronous on `getComputedStyle`? |
|---|---|---|---|
| **`em`** | parent: `font-size: calc((var(--h) + OFF) * 1px)`; child: `animation-delay: calc((1em / 1px - OFF) * -1s)` | no | **yes** (no layout needed) |
| **`lh`** | same with `line-height` / `1lh` | no | yes |
| **`cqw`/`cqh`** | container: `width: calc(var(--h) * 100px)`; child: `animation-delay: calc(1cqw / 1px * -1s)` | no | yes (forces layout) |
| **view-timeline** | spacer `width: calc(var(--h) * S/2 px)` moves a `view-timeline` subject; next layer uses `animation-timeline` | no | **no** — correct only after the next frame |

The key enabler is that Chrome 156 accepts `calc(<length> / <length>)` as a `<number>` inside `animation-delay`
(`CSS.supports('animation-delay: calc(1em / 1px * -1s)') === true`, tested).

A full **15-16-8 MLP with both layers in the animation engine** (em bridge, `linear()` relu, `composition: add`)
matches the JS reference to 1e-5 and runs synchronously at **1.3 ms/eval** — correct, but ~4x slower than
the pure `calc()` version of the same net (322 us/eval) and ~1.4x slower than hybrid (900 us/eval). The cost is
~3.5 us per CSS animation whose delay changes. Everything below is tested unless marked *assumed*.

---

## Findings table

| # | technique | tested | works | fully CSS between layers | layers | us/eval | precision | notes |
|---|---|---|---|---|---|---|---|---|
| 0 | direct `var(--animated)` in `animation-delay` | yes | **no** | — | 1 | — | — | delay reads `0s`. Also tainted through inheritance (grandchild). Re-confirms memory. |
| 1 | **em bridge** (`font-size` ← animated prop, `1em/1px` → delay) | yes | **yes** | yes | **256 tested** (no limit found) | 18 (1 layer) … 5 us/extra layer; 1300 for 15-16-8 | ~5e-6 abs per hop (float32 of `h+OFF`); grows ~linearly with depth | sync, no layout. `font-size` clamps to [0, 10000px] → carrier range after offset. |
| 1b | lh bridge (`line-height` / `1lh`) | yes | yes | yes | (as em) | — | (as em) | independent 2nd scalar channel per element. |
| 2 | cqw bridge (container width / `1cqw`) | yes | yes | yes | ≥2 (tested 2) | — | 1/64 px LayoutUnit quantisation ÷ scale | sync but forces layout; `container-type` imposes inline-size **containment**, so the container can't be sized by its own children. |
| 3 | **layout as the SUM** (animated `width`/`margin-left` per input → flex `max-content` width → abspos `inset:0` reader with `container-type` → `100cqw` → next layer delay) | yes | yes | yes | 2 | 62 (5 inputs, incl. a rect read) | 3.5e-5 on y (width error 0.034 px = 1/64 px) | true dot product in layout; negative weights via negative margins. Not cheaper than `composition: add`. |
| 4 | view-timeline bridge (layout position → animation progress) | yes | yes | yes | 2 hops tested | one frame (16.7 ms) regardless of hop count | 2.6e-6 on progress with S = 100000 px | NOT synchronous: first read in the same task returns the stale value; settles after 1 rAF, and a 2-hop chain also settles in 1 frame. |
| 5 | animated NON-custom property (`width` keyframes) → cqw → delay | yes | yes | yes | 2 | — | — | animated regular properties are not taint-tracked at all. |
| 6 | transition on a custom prop → `var()` in delay | yes | not tainted | n/a | — | — | — | transitioned values are usable in `animation-*`; but transitions need a value change trigger, so not a bridge for animation output. |
| 7 | `@container style(--h > 0.5)` range queries | yes | yes | yes | — | — | discrete | works in Chrome 156 (registered `<number>`); step/threshold activations, used in the demo to print a minus sign. |
| 8 | `steps()` running clock as per-frame time-multiplexer | yes | yes | yes | — | per frame | exact step values | a running `steps(4, jump-none)` animation on `--h` drives a paused layer through the em bridge frame-by-frame with no JS. |
| 9 | recurrence / iterative loop (value feeds back) | yes (cycle) | **no** | — | — | — | — | CSS rejects dependency cycles (`--a: calc(var(--b)+1); --b: calc(var(--a)+1)` → both invalid). No ancestor can read a descendant; there is no state cell. Time-multiplexing (8) is feed-forward only. |
| 10 | nested flat `matrix3d` chain → view-timeline readout | yes | **no** | — | — | — | — | view-timeline ignores transforms (progress identical with `translateX(-300px)`). Transform output is only readable by JS (`getBoundingClientRect`). |
| 11 | `anchor-size()` as a layout→size bridge | yes | abspos only | — | — | — | — | resolves on `position:absolute` elements (333px); non-positioned gets the fallback (1px) even though `CSS.supports` says true. |
| 12 | softmax division | yes | calc only | **no** | — | — | — | `exp()` can be a `linear()` easing and the sum `composition: add`, but division has no animation-engine form. One `calc()` per output. |

Max layers: 256 em-bridged layers verified exact (values saturate in that chain, so error stops growing; at 8 layers
of non-saturating values the error was 1.7e-4 — error compounds roughly linearly with depth).

---

## How the em bridge works, and the one gotcha

Problem: `animation-delay: calc(var(--h) * -1s)` is 0 when `--h` is animated. Mechanism: convert the animated number
into a *regular* property on one element, then read it back as a unit on a **different** element:

```css
@property --h { syntax: '<number>'; inherits: true; initial-value: 0; }
.neuron { animation: k 1s linear paused both; animation-composition: add; }   /* --h = Σ (animations) + base */
.bridge { font-size: calc((var(--h) + 8) * 1px); }                            /* regular prop, consumes animated --h */
.bridge > .next { animation-delay: calc(((1em / 1px) - 8 - HMIN) * -1s); }   /* 1em = inherited font-size, not tainted */
```

The gotcha that broke the first attempt (real output: `L=2 … sync read=0.1 ref=1.15 MISMATCH`): `em` inside a
non-`font-size` property is the element's **own** font-size, and Blink resolves `animation-*` from the element's base
style, where its own `--h` is still the pre-animation value (the bias). So **producer (`font-size`) and consumer
(`animation-delay`) must be different elements**; a neuron must not override `font-size` itself. Two elements per
layer (`.n > .f > .n > .f …`) fixed it: `L=256 … OK`.

Carrier limits (tested): computed `font-size` is clamped to `[0, 10000px]`, so the value plus offset must stay in that
range; values with |h| > 8 are clamped on purpose (relu is saturated at HMAX anyway). Resolution is float32 of
(value+offset): with offset 8 that is ~1e-6; `--y=1e-7` was lost, `--y=1e-5` was kept.

## Summation across elements: inherited `composition: add`

For the output layer each output neuron needs *all* hidden values, but a font-size carries one scalar. Solution: nest
the hidden neurons (`h0 > f0 > p0 > h1 > f1 > p1 > …`). `p_j` runs one animation per output `--o{k}` with
`animation-composition: add`; its underlying value is the **inherited** `--o{k}` from `p_{j-1}`, so the chain
accumulates `b2[k] + Σ_j W2[k][j]·relu(h_j)` with no JS and no calc. Verified exact (`maxAbsErr logits = 1.06e-5`).

```css
@keyframes o3-7 { from { --o3: 0 } to { --o3: calc(W2[3][7] * 8) } }     /* value = W2·HMAX·easing(t) */
.p { animation-duration: 16s;                      /* samples h over [-8, 8] */
     animation-timing-function: linear(0, 0 50%, 1);  /* relu: 0 for h<0, h/8 for h≥0 */
     animation-play-state: paused; animation-fill-mode: both; animation-composition: add;
     animation-delay: calc(((1em / 1px) - 8 - -8) * -1s); }
```

---

## What failed, with real output

- **Same-element em read** (above). Output: `L=  2 layers: maxAbsErr=1.27e+0 … sync read=0.1 ref=1.150000 MISMATCH`.
- **Flex container as its own cqw container**: `container-type: inline-size` + `width: max-content` gave `width: 0`
  (`sample: {"y":0,"width":0}`), because container-type applies inline-size containment. Fixed with an
  `position:absolute; inset:0` reader child, after which `maxAbsErr(container width px)=3.41e-2` (1/64 px).
- **View-timeline synchronicity**: `x=0.2 … immediate=0.999001 microtask=0.999001 macrotask=0.999001 rAF=0.999001 rAF2=0.799201`
  (stale until the next frame); second run `x=0.7 … macrotask=0.2997` (already correct — the frame happened to land
  between). Settles after one rAF in a 2-hop chain: `(0.99010,0.00980) (0.69307,0.30389) …`.
- **`fill-mode` omission** (first taint matrix): delay exactly `-1s` on a 1s animation with no fill → `--y: 0`. Always
  use `animation-fill-mode: both` and keep inputs strictly inside the sampled range.
- **`inherits: false` custom props vs `::after`**: counters in the demo read `0` until `--v`/`--a` were registered
  `inherits: true` (pseudo-elements inherit from their originating element).
- **Transforms → view-timeline**: `untransformed: 0.454545, translatedMinus300: 0.454545` (expected 0.727 if transforms
  counted). Not a channel.
- **`anchor-size()` on a non-positioned element**: `nonPositioned: "1px"` (fallback) vs `abspos: "333px"`.

## Cost model (15-16-8, same random weights, 300 evals each, all 15 inputs changed per eval)

| structure | us/eval | 1 input changed | animations |
|---|---|---|---|
| A all-animation nested, em bridge | 1309 | 813 | 368 |
| B hybrid: hidden animation (16 nested elements) + calc output | 974 | 468 | 240 |
| C hybrid: hidden animation (ONE element, 240 anims) + calc output | 904 | 434 | 240 |
| D pure calc, one element | 322 | 320 | 0 |

Roughly **3.5 us per animation per eval**, i.e. the animation engine re-resolves every animation on an element whenever
its `animation-delay` list changes. Reading the 16 hidden values adds ~25 us (`1366.6 us/eval incl. reading 16 hidden`).
Single-layer baseline from memory (2 animations, ~30 us) is consistent.

The `calc()` numbers are the earlier research's domain; they are included only as a baseline measured with the same
harness.

---

## Recommendation for `src/cssnet` mode `"animation"` (NetShape ≈ 15 → 16 → 8)

1. **Layer 1 (inputs → hidden):** 16 neuron elements `.n{j}`, each with 15 paused animations on a single property `--h`
   (`inherits: true`), `animation-delay: calc(var(--x{i}) * -1s)` (inputs normalised to [0, 1], duration 1s),
   keyframe end value `W1[j][i]`, `animation-composition: add`, base value `--h: b1[j]`, `animation-fill-mode: both`.
   Register every property with `@property` (`<number>`).
2. **Bridge:** each `.n{j}` has one child `.f` with `font-size: calc((var(--h) + 8) * 1px)` and **no other element in the
   chain sets `font-size`** (the host should set an explicit px `font-size`/`line-height` on any text it renders).
3. **Layer 2 (hidden → logits):** under each `.f`, a `.p{j}` with 8 animations on `--o0..--o7` (`inherits: true`),
   `animation-delay: calc(((1em / 1px) - 8 - HMIN) * -1s)`, duration `HMAX - HMIN` (16s), easing
   `linear(0, 0 50%, 1)` (relu over [-8, 8]), keyframe end value `W2[k][j] * HMAX`, `composition: add`. Nest
   `.n{j+1}` inside `.p{j}` so the inherited `--o{k}` accumulates; set `--o{k}: b2[k]` on the root.
4. **Softmax:** on the innermost element, `--e{k}: calc(exp(var(--o{k})))`, `--z: calc(Σ var(--e{k}))`,
   `--p{k}: calc(var(--e{k}) / var(--z))`. Division is the one thing the animation engine cannot do; this is one
   `calc()` per output and should be stated as such in the mode description (`'animation'` = animation engine for
   every weighted sum and activation; `calc()` only for the softmax normaliser).
5. **Readback:** `readOutputs()` = 8 `getPropertyValue('--p{k}')` on the innermost element (one `getComputedStyle`);
   `readHidden()` = `--h` from each `.n{j}` (16 `getComputedStyle`, ~25 us). All synchronous; no rAF needed.
6. **Weight updates:** regenerate the `@keyframes` text (one `<style>` element, 240 + 128 rules) — keyframe values are
   the weights. Measured cost of a full rebuild was not benchmarked here (*assumed* a few ms; it happens only after a
   training step, not per interaction).
7. **Budget:** expect ~1.3 ms per forward pass for 15-16-8. That is fine for per-interaction inference (the app's
   click-to-pixel budget is a frame) but not for per-pointermove; if `"animation"` needs to be cheaper, mode
   `"hybrid"` (same layer 1, calc output: ~0.9 ms) or dropping hidden width to 8 (~halves the animation count) are the
   levers. Pure calc remains ~4x faster.
8. **Hidden-value clamp:** the output easing samples h in [-8, 8]; with W1 ∈ [-0.4, 0.4]·15 inputs + bias this is
   safe. Enforce |h| ≤ 8 in training (or widen HMAX, which costs only font-size range: carrier max 10000px).
9. **Avoid:** view-timeline bridges (one frame of latency), cqw bridges (force layout), `display: none` anywhere in
   the chain (animations stop), and any `font-size` on elements inside the chain.

Variant worth a follow-up (not tested): since transitions are not tainted (finding 6), `transition: --h 0s` as a bridge
would still need a trigger per input change; `em` is simpler and already synchronous.

---

## Demo

`research/experiments/r1-best-demo.html` — a 4-5-3 MLP whose whole forward pass (both weighted sums, relu, bias) is
animation-engine work bridged by `em`, with softmax normalisation in one `calc()`. In **auto mode the page runs with
zero JavaScript**: the four inputs are running CSS animations on `:root` and `.drive`, delivered into layer 1 through
four independent unit channels (`1lh`, `1rlh`, `1rem`, `100cqw`). Nodes glow with activation, connection thickness
is `|w·x|` (cyan positive, magenta negative), hidden nodes print `h` and outputs print the softmax percentage via
`counter-reset: calc(round(...))` and `@container style(--h < 0)` for the sign. A read-only JS overlay compares the
CSS values against a JS forward pass each frame (measured: `max |Δhidden| 2.4e-6`, `max |Δprob| 3.4e-7`).
Toggling "manual inputs" switches `.n`'s delays to `var(--x{i})` set by sliders (the only JS that touches the net);
verified in both modes against the reference (worst 2.0e-6).

## Experiment files (all `node research/experiments/<file>` from the project root)

- `r1-harness.mjs` — headless Chromium + `page.setContent` helper
- `r1-smoke.mjs` — feature support matrix (all true in Chrome 156)
- `r1-taint-matrix.mjs` — bridges A–H above
- `r1-em-chain.mjs` — depth 1…256, timing, font-size carrier precision/clamp probe
- `r1-view-timeline.mjs`, `r1-view-timeline-chain.mjs` — synchronicity, precision, 2-hop chain
- `r1-layout-sum.mjs` — dot product as flex layout, read through cqw
- `r1-mlp-gen.mjs` — CSS/DOM generator + JS reference for the 2-layer all-animation net
- `r1-mlp-anim.mjs` — 15-16-8 parity + timing; `r1-mlp-variants.mjs` — cost model A–D
- `r1-probes.mjs` — anchor-size, transforms vs view-timeline, style range queries, cycles, steps() clock
- `r1-best-demo.mjs` → `r1-best-demo.html` (+ parity check and screenshot)
