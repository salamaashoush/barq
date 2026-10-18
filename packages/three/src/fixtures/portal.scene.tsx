/** @jsxImportSource @barqjs/three */
import { Show, type Accessor } from "@barqjs/core";
import * as THREE from "three";

import { createPortal, useThree } from "@barqjs/three";

export const target = new THREE.Group();
target.name = "target";

function Inner() {
  const scene = useThree((state) => state.scene);
  const previous = useThree((state) => state.previousRoot);
  return (
    <mesh
      name={
        (scene() as THREE.Object3D) === target && previous() !== undefined ? "in-layer" : "outside"
      }
    />
  );
}

export function WithPortal(props: { shown: Accessor<boolean> }) {
  return (
    <group name="main">
      <Show when={props.shown()}>
        {createPortal(
          () => (
            <Inner />
          ),
          target,
        )}
      </Show>
      <mesh name="sibling" />
    </group>
  );
}
