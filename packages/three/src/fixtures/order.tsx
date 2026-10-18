import { For, Show, createEffect, createSignal } from "@barqjs/core";
import type * as THREE from "three";

import { useFrame } from "@barqjs/three";

export const [names, setNames] = createSignal<string[]>([]);
export const [head, setHead] = createSignal(false);
export const seen: { frame: string[][]; effect: string[][] } = { frame: [], effect: [] };

let group: THREE.Group | null = null;
const order = (): string[] => (group === null ? [] : group.children.map((child) => child.name));

/** A list between a node that comes and goes before it and a fixed node after it. */
export function Ordered() {
  useFrame(() => void seen.frame.push(order()));
  createEffect(
    () => names(),
    () => void seen.effect.push(order()),
  );
  return (
    <group
      ref={(object: THREE.Group) => {
        group = object;
      }}
    >
      <Show when={head()}>
        <mesh name="head" />
      </Show>
      <For each={names()}>{(name) => <mesh name={name} />}</For>
      <mesh name="tail" />
    </group>
  );
}
