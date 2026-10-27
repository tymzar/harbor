import { ACTIONS, type ActionId, type NetWeights } from '../cssnet/contract'
import { NORMALISE_MASK } from '../signals/features'
import { RunningNorm } from '../signals/normalizer'
import { RollingAccuracy } from './accuracy'
import {
  ACC_WINDOW, INIT_SEED, MARKOV_DECAY, MARKOV_PRIOR_STRENGTH, PRIOR, SCHEMA_VERSION, SGD, SHAPE, blendAlpha,
} from './config'
import { Markov } from './markov'
import { argmax, cloneWeights, forward, initWeights, sgdStep } from './mlp'
import { deserialWeights, serialWeights, type ModelSnapshot, type PersistedModel } from './types'

interface Pending { x: Float32Array; markov: Float32Array; mlp: Float32Array }

/** Pure model logic (no I/O). Runs inside the worker, or in-thread as a fallback. */
export class ModelEngine {
  weights: NetWeights
  norm = new RunningNorm(SHAPE.inputs, NORMALISE_MASK)
  markov = new Markov(SHAPE.outputs, PRIOR, MARKOV_DECAY, MARKOV_PRIOR_STRENGTH)
  accMarkov = new RollingAccuracy(ACC_WINDOW)
  accMlp = new RollingAccuracy(ACC_WINDOW)
  examples = 0
  lastAction: number | null = null
  updatedAt = 0
  private pending: Pending | null = null

  private readonly clock: () => number
  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock
    this.weights = initWeights(SHAPE, PRIOR, INIT_SEED)
  }

  reset(): void {
    this.weights = initWeights(SHAPE, PRIOR, INIT_SEED)
    this.norm.reset()
    this.markov.reset()
    this.accMarkov.reset()
    this.accMlp.reset()
    this.examples = 0
    this.lastAction = null
    this.pending = null
    this.updatedAt = this.clock()
  }

  /** Predict from features without an action (initial page load). Sets the pending example. */
  predict(raw: ArrayLike<number>): ModelSnapshot {
    const x = this.norm.apply(raw)
    return this.makePending(x)
  }

  /**
   * An action happened. Label-delayed training: the features that produced
   * the previous prediction are trained against this action. Then `raw`
   * (features describing this action's interaction) produces the next prediction.
   */
  step(raw: ArrayLike<number>, action: ActionId): ModelSnapshot {
    const label = ACTIONS.indexOf(action)
    if (label < 0) throw new Error(`unknown action ${action}`)
    if (this.pending) {
      this.accMarkov.push(argmax(this.pending.markov) === label)
      this.accMlp.push(argmax(this.pending.mlp) === label)
      sgdStep(SHAPE, this.weights, this.pending.x, label, SGD)
      this.examples++
    }
    this.markov.update(this.lastAction, label)
    this.lastAction = label
    this.norm.update(raw)
    this.updatedAt = this.clock()
    return this.makePending(this.norm.apply(raw))
  }

  private makePending(x: Float32Array): ModelSnapshot {
    const markov = this.markov.predict(this.lastAction)
    const mlp = forward(SHAPE, this.weights, x).out
    this.pending = { x, markov, mlp }
    return this.snapshot()
  }

  snapshot(): ModelSnapshot {
    const p = this.pending ?? { x: new Float32Array(SHAPE.inputs), markov: this.markov.predict(this.lastAction), mlp: forward(SHAPE, this.weights, new Float32Array(SHAPE.inputs)).out }
    return {
      weights: cloneWeights(this.weights),
      x: p.x.slice(),
      markov: p.markov.slice(),
      mlp: p.mlp.slice(),
      alpha: blendAlpha(this.examples),
      stats: { examples: this.examples, markovAcc: this.accMarkov.value, mlpAcc: this.accMlp.value, accN: this.accMlp.size },
      updatedAt: this.updatedAt,
    }
  }

  toPersisted(): PersistedModel {
    return {
      schemaVersion: SCHEMA_VERSION,
      weights: serialWeights(this.weights),
      normStats: this.norm.toJSON(),
      markov: this.markov.toJSON(),
      updatedAt: this.updatedAt,
      examples: this.examples,
      lastAction: this.lastAction,
      acc: { markov: this.accMarkov.toJSON(), mlp: this.accMlp.toJSON() },
    }
  }

  load(m: PersistedModel): void {
    validatePersisted(m)
    this.weights = deserialWeights(m.weights)
    this.norm.load(m.normStats)
    this.markov.load(m.markov)
    this.examples = m.examples
    this.lastAction = m.lastAction
    this.updatedAt = m.updatedAt
    this.accMarkov.load(m.acc?.markov ?? [])
    this.accMlp.load(m.acc?.mlp ?? [])
    this.pending = null
  }
}

export function validatePersisted(m: unknown): asserts m is PersistedModel {
  const o = m as PersistedModel
  if (!o || typeof o !== 'object') throw new Error('model: not an object')
  if (o.schemaVersion !== SCHEMA_VERSION) throw new Error(`model: schemaVersion ${o.schemaVersion} != ${SCHEMA_VERSION}`)
  const { inputs: I, hidden: H, outputs: O } = SHAPE
  const w = o.weights
  if (!w || w.W1?.length !== H * I || w.b1?.length !== H || w.W2?.length !== O * H || w.b2?.length !== O) {
    throw new Error('model: weight shapes do not match')
  }
  if (!o.normStats || o.normStats.mean?.length !== I) throw new Error('model: normStats shape')
  if (!o.markov || o.markov.counts?.length !== O * O) throw new Error('model: markov shape')
  const all = [...w.W1, ...w.b1, ...w.W2, ...w.b2, ...o.normStats.mean, ...o.normStats.m2, ...o.markov.counts]
  if (!all.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('model: non-finite values')
}
