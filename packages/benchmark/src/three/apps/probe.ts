/**
 * What both pages share: the renderer wrapped so a scenario can wait for the
 * frame that shows its change, and the grid every scenario lays meshes out on.
 * Library-free, so neither side carries the other's cost.
 */

interface Renderer {
  render(scene: unknown, camera: unknown): unknown
}

interface Waiter {
  ready: () => boolean
  resolve: (at: number) => void
}

const waiters: Waiter[] = []
export let renders = 0

/** Count renders and settle waiters after each one. */
export function watch(gl: Renderer): void {
  const draw = gl.render.bind(gl)
  gl.render = (scene, camera) => {
    const result = draw(scene, camera)
    renders++
    const at = performance.now()
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].ready()) {
        waiters[i].resolve(at)
        waiters.splice(i, 1)
      }
    }
    return result
  }
}

/** The time of the end of the first render after which `ready` holds. */
export function afterRender(ready: () => boolean): Promise<number> {
  return new Promise((resolve) => waiters.push({ ready, resolve }))
}

/**
 * Run `work` as a task of the page and resolve with when it started. Work
 * started from a CDP evaluation is not counted in Chrome's script time,
 * while work a library schedules for itself is, so both sides start here.
 */
export function task(work: () => void): Promise<number> {
  return new Promise((resolve) => {
    // Just after a frame, so both libraries start at the same point of the
    // display's cycle and a wall time is not a reading of where it fell.
    requestAnimationFrame(() => {
      setTimeout(() => {
        const start = performance.now()
        work()
        resolve(start)
      }, 0)
    })
  })
}

/** Resolves after `count` animation frames. */
export function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count
    const tick = (): void => {
      if (--left <= 0) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

export interface Item {
  i: number
  x: number
  y: number
}

/** `n` meshes' places on a grid filling [-4, 4] in x and y. */
export function items(n: number): Item[] {
  const side = Math.ceil(Math.sqrt(n))
  return Array.from({ length: n }, (_, i) => ({
    i,
    x: ((i % side) / side) * 8 - 4,
    y: (Math.floor(i / side) / side) * 8 - 4,
  }))
}

export interface Bench {
  ready: boolean
  renders: () => number
  mount(n: number): Promise<number>
  unmount(): Promise<number>
  animate(mode: string, n: number, count: number): Promise<number>
  events(n: number, count: number): Promise<{ perEvent: number; hits: number }>
}

/**
 * Dispatch `count` pointer moves over the canvas, sweeping its middle, and
 * return the mean milliseconds each took. The handlers run synchronously
 * inside `dispatchEvent` in both libraries.
 */
export function sweep(target: HTMLElement, count: number): number {
  const rect = target.getBoundingClientRect()
  let total = 0
  for (let i = 0; i < count; i++) {
    const x = rect.width * (0.25 + 0.5 * ((i * 37) % 100) / 100)
    const y = rect.height * (0.25 + 0.5 * ((i * 61) % 100) / 100)
    const event = new PointerEvent("pointermove", {
      clientX: rect.left + x,
      clientY: rect.top + y,
      pointerId: 1,
      bubbles: true,
    })
    // offsetX/Y are read-only on a synthetic event and derived from the
    // target's box; defined here so both libraries read the intended point.
    Object.defineProperty(event, "offsetX", { value: x })
    Object.defineProperty(event, "offsetY", { value: y })
    const start = performance.now()
    target.dispatchEvent(event)
    total += performance.now() - start
  }
  return total / count
}
