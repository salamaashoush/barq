import { Errored, Loading, type Accessor } from "@barqjs/core";
import * as THREE from "three";

import { useGraph, useLoader } from "@barqjs/three";

interface Waiting {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/** A loader whose loads finish when a test says so. */
export class FakeLoader extends THREE.Loader {
  static calls: string[] = [];
  static waiting = new Map<string, Waiting>();

  override load(
    url: string,
    onLoad: (data: unknown) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    FakeLoader.calls.push(url);
    FakeLoader.waiting.set(url, { resolve: onLoad, reject: (error) => onError?.(error) });
  }

  static finish(url: string, value: unknown): void {
    FakeLoader.waiting.get(url)!.resolve(value);
    FakeLoader.waiting.delete(url);
  }

  static fail(url: string, message: string): void {
    FakeLoader.waiting.get(url)!.reject(new Error(message));
    FakeLoader.waiting.delete(url);
  }
}

export function Textured(props: { url: Accessor<string> }) {
  const texture = useLoader(FakeLoader, props.url) as Accessor<THREE.Texture>;
  return (
    <mesh name={`textured-${props.url()}`}>
      <meshBasicMaterial map={texture()} />
    </mesh>
  );
}

export function Suspended(props: { url: Accessor<string> }) {
  return (
    <Loading fallback={<group name="fallback" />}>
      <Errored fallback={(error) => <group name={`failed: ${error().message}`} />}>
        <Textured url={props.url()} />
      </Errored>
    </Loading>
  );
}

export function Model() {
  const gltf = useLoader(FakeLoader, "model.glb") as Accessor<{
    scene: THREE.Object3D;
    nodes: Record<string, THREE.Object3D>;
  }>;
  return (
    <Loading fallback={<group name="fallback" />}>
      <primitive object={gltf().scene} />
      <group name={`has-${Object.keys(gltf().nodes).join(",")}`} />
    </Loading>
  );
}

export function Graphed(props: { object: Accessor<THREE.Object3D> }) {
  const graph = useGraph(props.object);
  return <group name={Object.keys(graph().meshes).join(",")} />;
}
