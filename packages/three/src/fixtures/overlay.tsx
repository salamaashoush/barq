import { createSignal } from "@barqjs/core";

import { Html } from "@barqjs/three";

export const [labelText, setLabelText] = createSignal("salama");
export const [labelX, setLabelX] = createSignal(0);

/**
 * A scene component in a file of its own, with no pragma and no
 * configuration: its tree is three's tags, so it compiles for the scene,
 * and `<Html>`'s children compile for the document again.
 */
export function Overlay() {
  return (
    <group name="overlay">
      <mesh name="box" position={[0, 0, 0]} />
      <Html position={[labelX(), 0, 0]} center>
        <span class="label">{labelText()}</span>
      </Html>
    </group>
  );
}
