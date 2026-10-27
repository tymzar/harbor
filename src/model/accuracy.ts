export class RollingAccuracy {
  private hits: boolean[] = []
  readonly window: number
  constructor(window = 20) { this.window = window }
  push(hit: boolean): void {
    this.hits.push(hit)
    if (this.hits.length > this.window) this.hits.shift()
  }
  get value(): number {
    return this.hits.length ? this.hits.filter(Boolean).length / this.hits.length : 0
  }
  get size(): number { return this.hits.length }
  toJSON(): boolean[] { return [...this.hits] }
  load(h: boolean[]): void { this.hits = h.slice(-this.window) }
  reset(): void { this.hits = [] }
}
