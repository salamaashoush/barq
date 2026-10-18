import { For, Show, createSignal } from "@barqjs/core";
import * as THREE from "three";

import { extend } from "@barqjs/three";

/** A geometry that counts how often it is built. */
export class CountedGeometry extends THREE.BoxGeometry {
  static built = 0;
  constructor(width?: number, height?: number, depth?: number) {
    super(width, height, depth);
    CountedGeometry.built++;
  }
}

extend({ CountedGeometry });

declare module "@barqjs/three" {
  interface ThreeElements {
    countedGeometry: import("@barqjs/three").ThreeElement<typeof CountedGeometry>;
  }
}

export const [width, setWidth] = createSignal(2);
export const [shown, setShown] = createSignal(false);
export const [rows, setRows] = createSignal<number[]>([]);

export function Reactive() {
  return (
    <mesh>
      <countedGeometry args={[width(), 1, 1]} />
    </mesh>
  );
}

export function Constant() {
  return (
    <mesh>
      <countedGeometry args={[3, 1, 1]} />
    </mesh>
  );
}

export function Bare() {
  return (
    <mesh>
      <countedGeometry />
    </mesh>
  );
}

/** Mounted later, inside control flow, after the scene is up. */
export function Later() {
  return (
    <group>
      <Show when={shown()}>
        <mesh>
          <countedGeometry args={[width(), 1, 1]} />
        </mesh>
      </Show>
      <For each={rows()}>
        {(row) => (
          <mesh>
            <countedGeometry args={[width() + row, 1, 1]} />
          </mesh>
        )}
      </For>
    </group>
  );
}
