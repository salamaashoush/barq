/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Canvas, useFrame, type RootState } from "@react-three/fiber"
import { useRef, useState } from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import * as THREE from "three"

import { afterRender, frames, items, renders, sweep, task, watch, type Item } from "./probe.ts"

const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05)
const material = new THREE.MeshBasicMaterial({ color: "orange" })

const counters = { hits: 0 }
const onMove = (): void => {
  counters.hits++
}

type Mode = "refs" | "state"

interface Controls {
  setStatics: (items: Item[]) => void
  setAnimated: (items: Item[]) => void
  setMode: (mode: Mode) => void
  setInteractive: (items: Item[]) => void
}

const controls = {} as Controls

/** Positions written through refs in `useFrame`: R3F's recommended way to animate. */
function RefDriven({ items }: { items: Item[] }) {
  const meshes = useRef<THREE.Mesh[]>([])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const list = meshes.current
    for (let i = 0; i < list.length; i++) list[i].position.y = items[i].y + Math.sin(t + i) * 0.05
  })
  return (
    <>
      {items.map((p) => (
        <mesh
          key={p.i}
          geometry={geometry}
          material={material}
          position-x={p.x}
          position-y={p.y}
          ref={(mesh) => {
            if (mesh !== null) meshes.current[p.i] = mesh
          }}
        />
      ))}
    </>
  )
}

/** Positions from React state set in `useFrame`: every mesh re-renders each frame. */
function StateDriven({ items }: { items: Item[] }) {
  const [time, setTime] = useState(0)
  useFrame((state) => setTime(state.clock.elapsedTime))
  return (
    <>
      {items.map((p) => (
        <mesh
          key={p.i}
          geometry={geometry}
          material={material}
          position-x={p.x}
          position-y={p.y + Math.sin(time + p.i) * 0.05}
        />
      ))}
    </>
  )
}

function Scene() {
  const [statics, setStatics] = useState<Item[]>([])
  const [animated, setAnimated] = useState<Item[]>([])
  const [mode, setMode] = useState<Mode>("refs")
  const [interactive, setInteractive] = useState<Item[]>([])
  Object.assign(controls, { setStatics, setAnimated, setMode, setInteractive })
  return (
    <group>
      {statics.map((p) => (
        <mesh key={p.i} geometry={geometry} material={material} position={[p.x, p.y, 0]} />
      ))}
      {animated.length > 0 &&
        (mode === "refs" ? <RefDriven items={animated} /> : <StateDriven items={animated} />)}
      {interactive.map((p) => (
        <mesh
          key={p.i}
          geometry={geometry}
          material={material}
          position={[p.x, p.y, 0]}
          onPointerMove={onMove}
        />
      ))}
    </group>
  )
}

let state: RootState | null = null
const group = (): THREE.Object3D => state!.scene.children[0]
const count = (): number => group().children.length

function App() {
  const [frameloop, setFrameloop] = useState<"always" | "demand">("demand")
  frameloopSetter = setFrameloop
  return (
    <div style={{ width: "800px", height: "600px" }}>
      <Canvas
        dpr={1}
        flat
        frameloop={frameloop}
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
  )
}

let frameloopSetter: (loop: "always" | "demand") => void = () => {}

const bench = {
  ready: false,
  renders: () => renders,
  async mount(n: number): Promise<number> {
    const rendered = afterRender(() => count() === n)
    const start = await task(() => controls.setStatics(items(n)))
    return (await rendered) - start
  },
  async unmount(): Promise<number> {
    const rendered = afterRender(() => count() === 0)
    const start = await task(() => {
      flushSync(() => frameloopSetter("demand"))
      controls.setStatics([])
      controls.setAnimated([])
      controls.setInteractive([])
    })
    return (await rendered) - start
  },
  async prepare(mode: Mode, n: number): Promise<void> {
    const rendered = afterRender(() => count() === n)
    await task(() => {
      controls.setMode(mode)
      controls.setAnimated(items(n))
      // `useFrame` runs only on frames the loop draws; R3F's default loop is `always`.
      frameloopSetter("always")
    })
    await rendered
  },
  async run(count: number): Promise<void> {
    await frames(count)
  },
  async interactive(n: number): Promise<void> {
    const rendered = afterRender(() => count() === n)
    await task(() => controls.setInteractive(items(n)))
    await rendered
    await frames(2)
  },
  sweep(count: number): { perEvent: number; hits: number } {
    counters.hits = 0
    const perEvent = sweep(state!.gl.domElement, count)
    return { perEvent, hits: counters.hits }
  },
}
;(window as unknown as { __bench: typeof bench }).__bench = bench

createRoot(document.getElementById("app")!).render(<App />)
