import { createMemo } from "@barqjs/core";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { MAX_ASTEROIDS, random, useOrrery } from "./orrery.ts";

const INNER = 8.4;
const OUTER = 10.2;

function scatter(seed: number): { matrices: Float32Array; shades: Float32Array } {
  const next = random(seed);
  const matrices = new Float32Array(MAX_ASTEROIDS * 16);
  const shades = new Float32Array(MAX_ASTEROIDS * 3);
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();
  for (let i = 0; i < MAX_ASTEROIDS; i++) {
    const angle = next() * Math.PI * 2;
    // Two draws averaged crowd the rocks toward the middle of the belt.
    const radius = INNER + ((next() + next()) / 2) * (OUTER - INNER);
    position.set(Math.cos(angle) * radius, (next() - 0.5) * 0.6, Math.sin(angle) * radius);
    rotation.setFromEuler(euler.set(next() * 6.3, next() * 6.3, next() * 6.3));
    const size = 0.35 + next() ** 3 * 1.6;
    scale.set(size, size * (0.6 + next() * 0.5), size);
    matrix.compose(position, rotation, scale).toArray(matrices, i * 16);
    const shade = 0.55 + next() * 0.6;
    shades.set([shade, shade, shade * (0.9 + next() * 0.15)], i * 3);
  }
  return { matrices, shades };
}

export function Belt() {
  const orrery = useOrrery();
  const rocks = createMemo(() => scatter(orrery.seed()));
  return (
    <group rotation-y={(orrery.days() / 1600) * Math.PI * 2}>
      <instancedMesh
        args={[undefined, undefined, MAX_ASTEROIDS]}
        count={orrery.asteroids()}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <icosahedronGeometry args={[0.06, 0]} />
        <meshStandardMaterial color={orrery.beltColor()} roughness={0.95} flatShading />
        <instancedBufferAttribute attach="instanceMatrix" args={[rocks().matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[rocks().shades, 3]} />
      </instancedMesh>
    </group>
  );
}
