/** @jsxImportSource @barqjs/three */
import { For, Show, createSignal } from "@barqjs/core"
import { useFrame } from "@barqjs/three"
import * as THREE from "three"

import type { Item } from "./probe.ts"

const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05)
const material = new THREE.MeshBasicMaterial({ color: "orange" })

export const [statics, setStatics] = createSignal<Item[]>([])
export const [animated, setAnimated] = createSignal<Item[]>([])
export const [mode, setMode] = createSignal<"signals" | "refs">("signals")
export const [interactive, setInteractive] = createSignal<Item[]>([])
const [time, setTime] = createSignal(0)

export const counters = { hits: 0 }
const onMove = (): void => {
  counters.hits++
}

/** Positions from a signal: each mesh's `position-y` reads `time()`. */
function SignalDriven() {
  useFrame((state) => setTime(state.clock.getElapsed()))
  return (
    <For each={animated()}>
      {(p) => (
        <mesh
          geometry={geometry}
          material={material}
          position-x={p.x}
          position-y={p.y + Math.sin(time() + p.i) * 0.05}
        />
      )}
    </For>
  )
}

/** Positions written through refs in `useFrame`, as React Three Fiber's idiom has it. */
function RefDriven() {
  const meshes: THREE.Mesh[] = []
  const items = animated()
  useFrame((state) => {
    const t = state.clock.getElapsed()
    for (let i = 0; i < meshes.length; i++) meshes[i].position.y = items[i].y + Math.sin(t + i) * 0.05
  })
  return (
    <For each={animated()}>
      {(p) => (
        <mesh
          geometry={geometry}
          material={material}
          position-x={p.x}
          ref={(mesh: THREE.Mesh) => {
            meshes[p.i] = mesh
          }}
        />
      )}
    </For>
  )
}

export function Scene() {
  return (
    <group>
      <For each={statics()}>
        {(p) => <mesh geometry={geometry} material={material} position={[p.x, p.y, 0]} />}
      </For>
      <Show when={animated().length > 0}>
        <Show when={mode() === "signals"} fallback={<RefDriven />}>
          <SignalDriven />
        </Show>
      </Show>
      <For each={interactive()}>
        {(p) => (
          <mesh
            geometry={geometry}
            material={material}
            position={[p.x, p.y, 0]}
            onPointerMove={onMove}
          />
        )}
      </For>
    </group>
  )
}
