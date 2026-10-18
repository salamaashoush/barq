/** @jsxImportSource @barqjs/web */
/**
 * A page file under the document's JSX source, holding a scene inside its
 * `<Canvas>`: importing `@barqjs/three` adds three's tags to the document's
 * namespace, the four names both use stay the document's, and three's go by
 * their `three` prefix.
 */

import * as THREE from "three";

import { Canvas, Html, type RootState } from "@barqjs/three";

export const page = (
  <main>
    <h1 class="title">scene</h1>
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50 }}
      shadows="soft"
      dpr={[1, 2]}
      frameloop="demand"
      gl={(defaults) => new THREE.WebGLRenderer(defaults)}
      onCreated={(state: RootState) => state.gl}
      style={{ height: "300px" }}
    >
      <ambientLight intensity={0.5} />
      <mesh position={[1, 2, 3]} onClick={(event) => event.object.name}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="orange" />
      </mesh>
      <threeLine />
      <spinner args={["salama"]} />
      <Html position={[0, 1, 0]} center>
        <span class="label">salama</span>
      </Html>
    </Canvas>
    <svg viewBox="0 0 10 10">
      <line x1="0" y1="0" x2="10" y2="10" />
      <path d="M0 0L10 10" />
    </svg>
    <audio src="example.com/a.mp3" controls />
  </main>
);

// @ts-expect-error A vector does not take a string, under the document's JSX too.
export const badPosition = <mesh position="up" />;

// @ts-expect-error `line` is the SVG element here, which has no `geometry`.
export const svgLine = <line geometry={new THREE.BufferGeometry()} />;

// @ts-expect-error `frameloop` is one of three modes.
export const badCanvas = <Canvas frameloop="sometimes" />;
