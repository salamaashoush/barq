import type { Accessor } from "@barqjs/core";

import { Canvas } from "../canvas.tsx";
import type { RootState } from "../store.ts";
import { fakeRenderer, type FakeRenderer } from "../test-utils.ts";
import { Overlay } from "./overlay.scene.tsx";

export const renderers: FakeRenderer[] = [];

/** A page holding a canvas, its scene written in a file compiled for the scene's renderer. */
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
        <Overlay />
      </Canvas>
    </main>
  );
}
