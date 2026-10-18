/**
 * A scene file under `jsxImportSource: "@barqjs/three"`: every three class is
 * a tag, typed from three's own declarations.
 */

import { For, createSignal, type Accessor } from "@barqjs/core";
import * as THREE from "three";

import type { ThreeElement, ThreeEvent } from "@barqjs/three";

class Spinner extends THREE.Object3D {
  speed = 1;
  constructor(public readonly label: string) {
    super();
  }
}

declare module "@barqjs/three" {
  interface ThreeElements {
    spinner: ThreeElement<typeof Spinner>;
  }
}

const [x] = createSignal(0);
const [ids] = createSignal([1, 2, 3]);

export const math = (
  <group position={[x(), 2, 3]} rotation={[0, Math.PI, 0]} scale={2} visible>
    <mesh position={new THREE.Vector3()} quaternion={[0, 0, 0, 1]} position-x={x()} />
  </group>
);

export const args = (
  <mesh>
    <boxGeometry args={[1, 2, 3]} />
    <meshStandardMaterial color="hotpink" roughness={0.4} emissive={0x111111} />
  </mesh>
);

export const events = (
  <mesh
    onClick={(event) => {
      const object: THREE.Object3D = event.object;
      const distance: number = event.distance;
      const clientX: number = event.clientX;
      const native: MouseEvent = event.nativeEvent;
      event.stopPropagation();
      return [object, distance, clientX, native];
    }}
    onPointerMove={(event: ThreeEvent<PointerEvent>) =>
      event.target.setPointerCapture(event.pointerId)
    }
    onPointerMissed={(event: MouseEvent) => event.button}
  />
);

export const refs = (
  <mesh
    ref={(mesh) => {
      const typed: THREE.Mesh = mesh;
      return typed;
    }}
  />
);

export const primitive = <primitive object={new THREE.Group()} position={[1, 2, 3]} />;

export const attach = (
  <mesh>
    <meshBasicMaterial attach="material-0" />
    <meshBasicMaterial
      attach={(parent: THREE.Mesh, self: THREE.Material) => () => void [parent, self]}
    />
  </mesh>
);

export const extended = <spinner args={["salama"]} speed={2} position={[0, 1, 0]} />;

export const flow = (
  <group>
    <For each={ids()}>{(id) => <mesh position-x={id} />}</For>
  </group>
);

function Box(props: { color: Accessor<string>; size?: Accessor<number> }) {
  return (
    <mesh scale={props.size?.() ?? 1}>
      <meshBasicMaterial color={props.color()} />
    </mesh>
  );
}

export const component = <Box color="red" size={2} />;

// @ts-expect-error A vector does not take a string.
export const badPosition = <mesh position="up" />;

// @ts-expect-error BoxGeometry's arguments are numbers.
export const badArgs = <boxGeometry args={["wide"]} />;

// @ts-expect-error A primitive needs its object.
export const emptyPrimitive = <primitive />;

// @ts-expect-error No class is registered under this tag.
export const unknown = <notAClass />;

// @ts-expect-error A spinner's constructor needs its label.
export const missingArgs = <spinner />;

// @ts-expect-error `color` on Box is required.
export const missingProp = <Box size={1} />;

// @ts-expect-error A click handler is handed a ThreeEvent, not a string.
export const badHandler = <mesh onClick={(event: string) => event} />;
