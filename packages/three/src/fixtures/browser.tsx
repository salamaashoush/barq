import { render } from "@barqjs/web";

import { Canvas } from "../canvas.tsx";
import { addAfterEffect } from "../loop.ts";
import type { RootState } from "../store.ts";
import { Fill, setColor } from "./browser-scene.tsx";

interface Probe {
  renders: number;
  frames: number;
  state: RootState | null;
  setColor: (color: string) => void;
  pixel: () => number[];
}

const probe: Probe = {
  renders: 0,
  frames: 0,
  state: null,
  setColor,
  pixel() {
    const gl = probe.state!.gl.getContext();
    const out = new Uint8Array(4);
    gl.readPixels(
      gl.drawingBufferWidth >> 1,
      gl.drawingBufferHeight >> 1,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      out,
    );
    return [...out];
  },
};
(window as unknown as { __three: Probe }).__three = probe;
addAfterEffect(() => {
  probe.frames++;
});

render(
  () => (
    <div style={{ width: "64px", height: "64px" }}>
      <Canvas
        flat
        dpr={1}
        gl={{ preserveDrawingBuffer: true, antialias: false }}
        onCreated={(state) => {
          probe.state = state;
          const gl = state.gl;
          const draw = gl.render.bind(gl);
          gl.render = (scene, camera) => {
            probe.renders++;
            draw(scene, camera);
          };
        }}
      >
        <Fill />
      </Canvas>
    </div>
  ),
  document.getElementById("app")!,
);
