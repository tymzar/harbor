import { del, get, set } from 'idb-keyval'
import type { ActionId, CssNet } from '../cssnet/contract'
import { FeatureExtractor, attachDomListeners, selectModelFeatures } from '../signals'
import { MIN_EVIDENCE, blendScores, reorderBy, swapMargin } from '../app/adaptive'
import { isProbVector, loadCssNetModule, mountNet, type CssNetModule } from '../app/cssnetBridge'
import { Ranker, type PersistedRanker, type RankerSnapshot } from '../model/ranker'

/**
 * Cove's model: the same generic Ranker as Harbor, over three groups. Channel and DM order in the
 * sidebar, and the order of message actions in the hover toolbar, follow how you use them. One
 * CSS net per group computes the MLP part of the score in the stylesheet; JS is the fallback.
 */

export const CHANNEL_IDS = ['general', 'design', 'engineering', 'launch-q4', 'random', 'support', 'standup', 'hiring'] as const
export const DM_IDS = ['dm-priya', 'dm-marco', 'dm-kenji', 'dm-lena', 'dm-sam', 'dm-aisha'] as const
export const ACTION_IDS = ['react-thumbs', 'react-check', 'react-eyes', 'reply', 'save', 'copy-link'] as const
export type ActionKey = (typeof ACTION_IDS)[number]
export type Group = 'channels' | 'dms' | 'actions'

export const COVE_CATALOG = {
  groups: [
    { id: 'channels', items: CHANNEL_IDS },
    { id: 'dms', items: DM_IDS },
    { id: 'actions', items: ACTION_IDS },
  ],
}

/**
 * open: opened a channel/DM, or used a message action. send: posted there (strongest everyday
 * signal). search: picked it in the switcher (explicit intent). query: the switcher's top match
 * when closed without picking. star / unstar: starred a channel (unstar slightly lowers it).
 */
export type CoveVerb = 'open' | 'send' | 'search' | 'query' | 'star' | 'unstar'
const VERB_WEIGHT: Record<CoveVerb, number> = { open: 1, send: 1.5, search: 1.25, query: 0.3, star: 1.5, unstar: -0.3 }
const POINTER_VERBS = new Set<string>(['open', 'star'])
/** What the feature extractor logs for each verb (its journey features only). */
const AS_ACTION: Record<CoveVerb, ActionId> = { open: 'open', send: 'share', search: 'search', query: 'query', star: 'favorite', unstar: 'favorite' }

const MODEL_KEY = 'cove/model'
const SCHEMA = 1

export interface BrainState {
  ready: boolean
  netSource: 'cssnet' | 'fallback' | 'none'
  orders: Record<Group, string[]>
  /** Shown score per item (catalog order), for the insights panel. */
  scores: Record<string, number>
  alpha: number
  examples: number
  evidence: Record<string, number>
  /** Per group: max |CSS - JS| of the last pass (parity). */
  parity: Record<string, number>
  version: number
}

const defaultOrders = (): Record<Group, string[]> => ({ channels: [...CHANNEL_IDS], dms: [...DM_IDS], actions: [...ACTION_IDS] })

export class CoveBrain {
  readonly ranker = new Ranker(COVE_CATALOG, { verbWeight: VERB_WEIGHT, pointerVerbs: POINTER_VERBS, schemaVersion: SCHEMA })
  private fx = new FeatureExtractor(performance.now(), { width: typeof window !== 'undefined' ? window.innerWidth : 1280 })
  private mod: CssNetModule | null = null
  private nets: Partial<Record<Group, CssNet>> = {}
  private host: HTMLElement | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()
  private started = false
  private state: BrainState = {
    ready: false, netSource: 'none', orders: defaultOrders(), scores: {}, alpha: 0, examples: 0, evidence: {}, parity: {}, version: 0,
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  getState = () => this.state
  private set(patch: Partial<BrainState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 }
    this.listeners.forEach((l) => l())
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    attachDomListeners(this.fx)
    addEventListener('pagehide', () => this.flush())
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush() })
    // The nets need rendered (not display:none) elements to compute; keep them offscreen.
    this.host = document.createElement('div')
    this.host.dataset.testid = 'cove-cssnet-host'
    this.host.style.cssText = 'position:fixed;left:-10000px;top:0;width:400px;height:300px;pointer-events:none'
    this.host.setAttribute('aria-hidden', 'true')
    document.body.appendChild(this.host)
    this.mod = await loadCssNetModule()
    let source: BrainState['netSource'] = 'cssnet'
    for (const g of COVE_CATALOG.groups) {
      const scope = document.createElement('div')
      scope.dataset.netScope = g.id
      scope.style.cssText = 'position:absolute;inset:0'
      this.host.appendChild(scope)
      const m = mountNet(this.mod, scope, this.ranker.shape, 'calc')
      if (m.source === 'fallback') source = 'fallback'
      this.nets[g.id as Group] = m.net
    }
    try {
      const saved = await get<PersistedRanker>(MODEL_KEY)
      if (saved) this.ranker.load(saved)
    } catch (e) {
      console.warn('cove: saved model ignored', e)
    }
    const orders = (this.ranker.orders as Record<Group, string[]> | null) ?? defaultOrders()
    this.set({ ready: true, netSource: source, orders })
    this.apply(this.ranker.predict(selectModelFeatures(this.fx.idle()), 'channels'), true)
  }

  /** A press: train, then re-rank that item's group (the other groups' context moved too, so refresh all). */
  engage(group: Group, item: string, verb: CoveVerb): void {
    if (!this.state.ready) return
    const t = performance.now()
    const raw = this.fx.snapshot(AS_ACTION[verb], t)
    const s = this.ranker.step(selectModelFeatures(raw), item, verb, group, t)
    this.apply(s, true)
    this.scheduleSave()
  }

  /**
   * Scores per group: (1 - alpha) * affinity + alpha * MLP, with the MLP part read from that
   * group's CSS net (validated; JS forward pass if the CSS read is not a probability vector).
   * Orders move only past the hysteresis margin, and only once a group has some evidence.
   */
  private apply(s: RankerSnapshot, adapt: boolean) {
    const idx = this.ranker.index
    const mlp = Array.from(s.mlp)
    const parity: Record<string, number> = {}
    for (const g of COVE_CATALOG.groups) {
      const net = this.nets[g.id as Group]
      if (!net) continue
      const mask = idx.mask(g.id)
      net.setWeights(s.weights)
      net.setInputs(Float32Array.from(s.xByGroup[g.id]), mask)
      const css = net.readOutputs()
      let maxDiff = 0
      if (isProbVector(css, idx.shape.outputs)) {
        idx.ids.forEach((_, i) => { if (mask[i]) { maxDiff = Math.max(maxDiff, Math.abs(css[i] - s.mlp[i])); mlp[i] = css[i] } })
        parity[g.id] = maxDiff
      } else parity[g.id] = NaN
    }
    const scores = blendScores(s.affinity, mlp, s.alpha)
    const at = (id: string) => scores[idx.item(id)]
    const orders = { ...this.state.orders }
    let changed = false
    if (adapt) {
      for (const g of COVE_CATALOG.groups) {
        const gid = g.id as Group
        if (s.evidence[gid] < MIN_EVIDENCE) continue
        const next = reorderBy(orders[gid], at, swapMargin(s.evidence[gid]))
        if (next.join() !== orders[gid].join()) { orders[gid] = next; changed = true }
      }
    }
    if (changed) this.ranker.setOrders(orders)
    this.set({
      orders: changed ? orders : this.state.orders,
      scores: Object.fromEntries(idx.ids.map((id, i) => [id, scores[i]])),
      alpha: s.alpha, examples: s.stats.examples, evidence: s.evidence, parity,
    })
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => { this.saveTimer = null; void this.save() }, 800)
  }
  private flush() { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; void this.save() } }
  private async save() {
    try { await set(MODEL_KEY, this.ranker.toPersisted()) } catch (e) { console.warn('cove: model save failed', e) }
  }

  async reset(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null }
    this.ranker.reset()
    try { await del(MODEL_KEY) } catch { /* storage unavailable */ }
    this.set({ orders: defaultOrders() })
    this.apply(this.ranker.snapshot(), false)
  }

  /** Test hook (Playwright): window.__cove. */
  hook() {
    return {
      ready: () => this.state.ready,
      orders: () => this.state.orders,
      stats: () => ({ examples: this.state.examples, alpha: this.state.alpha, netSource: this.state.netSource, parity: this.state.parity }),
      scores: () => this.state.scores,
      reset: () => this.reset(),
    }
  }
}
