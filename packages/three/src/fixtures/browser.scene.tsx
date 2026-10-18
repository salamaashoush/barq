/** @jsxImportSource @barqjs/three */
import { createSignal } from "@barqjs/core";

export const [color, setColor] = createSignal("#ff0000");

/** A plane that fills the default camera's view, in an unlit color. */
export function Fill() {
  return (
    <mesh>
      <planeGeometry args={[20, 20]} />
      <meshBasicMaterial color={color()} />
    </mesh>
  );
}
