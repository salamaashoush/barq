/** @jsxImportSource @barqjs/three */
import { createSignal } from "@barqjs/core";

import { useFrame, useThree } from "@barqjs/three";
import type { RootState } from "@barqjs/three";

export const [spin, setSpin] = createSignal(0);
export const seen: { state: RootState | null; deltas: number[]; order: string[] } = {
  state: null,
  deltas: [],
  order: [],
};

/** Writes a signal from `useFrame`; the mesh it drives must show it the same frame. */
export function Spinner() {
  useFrame((state, delta) => {
    seen.state = state;
    seen.deltas.push(delta);
    setSpin(spin() + 1);
  });
  return <mesh name="spinner" rotation-y={spin()} />;
}

export function Ordered() {
  useFrame(() => void seen.order.push("late"), 2);
  useFrame(() => void seen.order.push("early"), -1);
  useFrame((state) => {
    seen.order.push("render");
    state.gl.render(state.scene, state.camera);
  }, 1);
  return <group />;
}

export function Reader() {
  const width = useThree((state) => state.size.width);
  return <mesh name="reader" scale-x={width()} />;
}
