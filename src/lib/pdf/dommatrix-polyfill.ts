type DOMMatrixInitLike = number[] | { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }

/**
 * Minimal DOMMatrix polyfill for PDF.js server-side usage.
 *
 * PDF.js evaluates `new DOMMatrix()` at module init in Node builds. In many server runtimes
 * (including Vercel), `globalThis.DOMMatrix` may be missing, causing a hard crash.
 *
 * This polyfill implements only the small subset of APIs PDF.js relies on for transforms.
 * It is not intended to be a full DOMMatrix spec implementation.
 */
export function ensureDOMMatrix() {
  if (typeof (globalThis as any).DOMMatrix === 'function') return

  class DOMMatrixPolyfill {
    a: number
    b: number
    c: number
    d: number
    e: number
    f: number

    constructor(init?: DOMMatrixInitLike) {
      // identity
      this.a = 1
      this.b = 0
      this.c = 0
      this.d = 1
      this.e = 0
      this.f = 0

      if (!init) return

      if (Array.isArray(init)) {
        if (init.length >= 6) {
          ;[this.a, this.b, this.c, this.d, this.e, this.f] = init.slice(0, 6) as number[]
        } else if (init.length === 0) {
          // identity
        }
      } else if (typeof init === 'object') {
        this.a = typeof init.a === 'number' ? init.a : this.a
        this.b = typeof init.b === 'number' ? init.b : this.b
        this.c = typeof init.c === 'number' ? init.c : this.c
        this.d = typeof init.d === 'number' ? init.d : this.d
        this.e = typeof init.e === 'number' ? init.e : this.e
        this.f = typeof init.f === 'number' ? init.f : this.f
      }
    }

    private _mul(m: DOMMatrixPolyfill) {
      const a = this.a * m.a + this.c * m.b
      const b = this.b * m.a + this.d * m.b
      const c = this.a * m.c + this.c * m.d
      const d = this.b * m.c + this.d * m.d
      const e = this.a * m.e + this.c * m.f + this.e
      const f = this.b * m.e + this.d * m.f + this.f
      this.a = a
      this.b = b
      this.c = c
      this.d = d
      this.e = e
      this.f = f
      return this
    }

    multiplySelf(other: any) {
      return this._mul(other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other))
    }

    preMultiplySelf(other: any) {
      const o = other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other)
      const cur = new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e, this.f])
      this.a = o.a
      this.b = o.b
      this.c = o.c
      this.d = o.d
      this.e = o.e
      this.f = o.f
      return this._mul(cur)
    }

    translate(tx = 0, ty = 0) {
      return this._mul(new DOMMatrixPolyfill([1, 0, 0, 1, tx, ty]))
    }

    scale(scaleX = 1, scaleY = scaleX) {
      return this._mul(new DOMMatrixPolyfill([scaleX, 0, 0, scaleY, 0, 0]))
    }

    invertSelf() {
      const det = this.a * this.d - this.b * this.c
      if (!det) return this
      const a = this.d / det
      const b = -this.b / det
      const c = -this.c / det
      const d = this.a / det
      const e = (this.c * this.f - this.d * this.e) / det
      const f = (this.b * this.e - this.a * this.f) / det
      this.a = a
      this.b = b
      this.c = c
      this.d = d
      this.e = e
      this.f = f
      return this
    }
  }

  ;(globalThis as any).DOMMatrix = DOMMatrixPolyfill
}

