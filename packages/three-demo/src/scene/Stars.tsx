import { createMemo } from "@barqjs/core";
import { useLoader } from "@barqjs/three";
import { AdditiveBlending, TextureLoader } from "three";

import { random, useOrrery } from "./orrery.ts";

const STARS = 4000;

function sky(seed: number): { positions: Float32Array; colors: Float32Array } {
  const next = random(seed ^ 0x5f3759df);
  const positions = new Float32Array(STARS * 3);
  const colors = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const u = next() * 2 - 1;
    const theta = next() * Math.PI * 2;
    const radius = 90 + next() * 60;
    const ring = Math.sqrt(1 - u * u);
    positions.set(
      [ring * Math.cos(theta) * radius, u * radius, ring * Math.sin(theta) * radius],
      i * 3,
    );
    const warmth = next();
    const brightness = 0.5 + next() * 0.5;
    colors.set(
      [brightness * (0.75 + warmth * 0.25), brightness * 0.85, brightness * (1 - warmth * 0.3)],
      i * 3,
    );
  }
  return { positions, colors };
}

export function Stars() {
  const orrery = useOrrery();
  const glow = useLoader(TextureLoader, "/textures/glow.svg");
  const field = createMemo(() => sky(orrery.seed()));
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[field().positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[field().colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glow()}
        size={1.6}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
