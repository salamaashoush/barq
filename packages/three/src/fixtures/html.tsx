import { cells, Errored, Loading } from "@barqjs/core";
import type * as THREE from "three";

import { Html, useLoader } from "@barqjs/three";

import { FakeLoader } from "./loader.tsx";

interface LabelledProps {
  url: string;
}

function Labelled(props: LabelledProps) {
  const texture = useLoader(FakeLoader, cells(props).url) as () => THREE.Texture;
  return (
    <group name="labelled">
      <mesh>
        <meshBasicMaterial map={texture()} />
      </mesh>
      <Html>
        <span class="label">label</span>
      </Html>
    </group>
  );
}

export function LabelInLoading() {
  return (
    <Loading fallback={<group name="fallback" />}>
      <Labelled url="html-wait.png" />
    </Loading>
  );
}

export function LabelInErrored() {
  return (
    <Errored fallback={<group name="failed" />}>
      <Loading fallback={<group name="fallback" />}>
        <Labelled url="html-fail.png" />
      </Loading>
    </Errored>
  );
}
