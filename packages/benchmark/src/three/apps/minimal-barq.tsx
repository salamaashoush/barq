import { Canvas } from "@barqjs/three"
import { render } from "@barqjs/web"

import { Box } from "./minimal.scene.tsx"

render(
  () => (
    <Canvas>
      <Box />
    </Canvas>
  ),
  document.getElementById("app")!,
)
