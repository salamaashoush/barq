import { render } from "@barqjs/web";

import { Canvas } from "../canvas.tsx";
import { Html } from "../html.ts";

const box = { display: "inline-block", width: "20px", height: "20px" };

/**
 * Three labels across a 200 by 200 canvas, each 20 by 20 to the right of and
 * below its point: one left as it is, one told through its style not to take
 * pointer events, one told through `pointerEvents`.
 */
render(
  () => (
    <div style={{ width: "200px", height: "200px" }}>
      <Canvas dpr={1} gl={{ antialias: false }}>
        <Html position={[-1.5, 0, 0]}>
          <span class="open" style={box} />
        </Html>
        <Html position={[0, 0, 0]} style={{ "pointer-events": "none" }} wrapperClass="styled">
          <span class="styled" style={box} />
        </Html>
        <Html position={[1.5, 0, 0]} pointerEvents="none" wrapperClass="prop">
          <span class="prop" style={box} />
        </Html>
      </Canvas>
    </div>
  ),
  document.getElementById("app")!,
);
