import { Canvas } from "@barqjs/three"
import { render } from "@barqjs/web"

render(
  () => (
    <Canvas>
      <mesh rotation={[0.4, 0.6, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="orange" />
      </mesh>
    </Canvas>
  ),
  document.getElementById("app")!,
)
