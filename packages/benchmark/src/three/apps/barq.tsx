
import { Canvas, type RootState } from "@barqjs/three"
import { render } from "@barqjs/web"
import type * as THREE from "three"

import {
  Scene,
  counters,
  setAnimated,
  setInteractive,
  setMode,
  setStatics,
} from "./barq.scene.tsx"
import { afterRender, frames, items, renders, sweep, task, watch } from "./probe.ts"

let state: RootState | null = null
const group = (): THREE.Object3D => state!.scene.children[0]
const count = (): number => group().children.length

const bench = {
  ready: false,
  renders: () => renders,
  async mount(n: number): Promise<number> {
    const rendered = afterRender(() => count() === n)
    const start = await task(() => {
      setStatics(items(n))
    })
    return (await rendered) - start
  },
  async unmount(): Promise<number> {
    const rendered = afterRender(() => count() === 0)
    const start = await task(() => {
      setStatics([])
      setAnimated([])
      setInteractive([])
    })
    return (await rendered) - start
  },
  async prepare(mode: "signals" | "refs", n: number): Promise<void> {
    const rendered = afterRender(() => count() === n)
    await task(() => {
      setMode(mode)
      setAnimated(items(n))
    })
    await rendered
  },
  async run(count: number): Promise<void> {
    await frames(count)
  },
  async interactive(n: number): Promise<void> {
    const rendered = afterRender(() => count() === n)
    await task(() => {
      setInteractive(items(n))
    })
    await rendered
    // Let the matrices of the first frame settle before casting against them.
    await frames(2)
  },
  sweep(count: number): { perEvent: number; hits: number } {
    counters.hits = 0
    const perEvent = sweep(state!.gl.domElement, count)
    return { perEvent, hits: counters.hits }
  },
}
;(window as unknown as { __bench: typeof bench }).__bench = bench

render(
  () => (
    <div style={{ width: "800px", height: "600px" }}>
      <Canvas
        dpr={1}
        flat
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 8] }}
        onCreated={(created) => {
          state = created
          watch(created.gl)
          void afterRender(() => true).then(() => {
            bench.ready = true
            ;(window as unknown as { __ready: boolean }).__ready = true
          })
        }}
      >
        <Scene />
      </Canvas>
    </div>
  ),
  document.getElementById("app")!,
)
