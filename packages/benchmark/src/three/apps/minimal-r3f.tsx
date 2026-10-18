/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Canvas } from "@react-three/fiber"
import { createRoot } from "react-dom/client"

createRoot(document.getElementById("app")!).render(
  <Canvas>
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="orange" />
    </mesh>
  </Canvas>,
)
