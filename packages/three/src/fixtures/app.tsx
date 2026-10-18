import { For, createSignal, type Accessor } from "@barqjs/core";

import { Canvas, type RootState } from "@barqjs/three";

import { fakeRenderer, type FakeRenderer } from "../test-utils.ts";
import { Overlay } from "./overlay.tsx";

export const renderers: FakeRenderer[] = [];
export const [inline, setInline] = createSignal(["a", "b"]);

/**
 * A page holding a canvas. The scene is written two ways, both with no
 * configuration: inline as the canvas's children, and as a component from a
 * file of its own.
 */
export function App(props: {
  onCreated: Accessor<(state: RootState) => void>;
  dpr?: Accessor<number>;
}) {
  return (
    <main>
      <h1>scene</h1>
      <Canvas
        gl={(defaults) => {
          const gl = fakeRenderer(defaults.canvas as HTMLCanvasElement);
          renderers.push(gl);
          return gl;
        }}
        dpr={props.dpr?.() ?? 1}
        class="stage"
        style={{ height: "300px" }}
        onCreated={props.onCreated()}
      >
        <ambientLight intensity={0.5} />
        <For each={inline()}>{(name) => <mesh name={`inline-${name}`} />}</For>
        <Overlay />
      </Canvas>
    </main>
  );
}
