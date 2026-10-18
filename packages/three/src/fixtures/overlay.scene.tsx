/** @jsxImportSource @barqjs/three */
import { createSignal } from "@barqjs/core";

import { Html } from "@barqjs/three";
import { Label } from "./label.tsx";

export const [labelText, setLabelText] = createSignal("salama");
export const [labelX, setLabelX] = createSignal(0);

export function Overlay() {
  return (
    <group name="overlay">
      <mesh name="box" position={[0, 0, 0]} />
      <Html position={[labelX(), 0, 0]} center>
        <Label text={labelText()} />
      </Html>
    </group>
  );
}
