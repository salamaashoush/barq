import { Canvas } from "@barqjs/three";

import Box from "./scene.tsx";

export default function App() {
  return (
    <main>
      <h1>Two boxes</h1>
      <Canvas camera={{ position: [0, 0, 5] }} style={{ height: "320px" }}>
        <ambientLight intensity={Math.PI / 2} />
        <directionalLight position={[2, 3, 5]} intensity={Math.PI} />
        <Box x={-1.2} />
        <Box x={1.2} />
      </Canvas>
    </main>
  );
}
