/** @jsxImportSource @barqjs/three */
import { For, Show, createSignal } from "@barqjs/core";
import type * as THREE from "three";

export const [x, setX] = createSignal(0);
export const [color, setColor] = createSignal("red");
export const [shown, setShown] = createSignal(true);
export const [ids, setIds] = createSignal([1, 2, 3]);
export const [width, setWidth] = createSignal(1);

export const mesh: { current: THREE.Mesh | null } = { current: null };
export const geometries: THREE.BufferGeometry[] = [];

export function Box() {
  return (
    <mesh ref={mesh} name="box" position={[x(), 1, 2]} rotation-y={Math.PI}>
      <boxGeometry
        args={[width(), 1, 1]}
        ref={(g: THREE.BufferGeometry) => void geometries.push(g)}
      />
      <meshStandardMaterial color={color()} />
    </mesh>
  );
}

export default function Scene() {
  return (
    <group name="root">
      <Show when={shown()}>
        <Box />
      </Show>
      <For each={ids()}>{(id) => <mesh name={`item-${id}`} position-x={id} />}</For>
    </group>
  );
}
