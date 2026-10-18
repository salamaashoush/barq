import { Loading, createMemo } from "@barqjs/core";

import { Canvas } from "@barqjs/three";

import { fakeRenderer } from "../test-utils.ts";

let finish: (value: string) => void = () => {};

export function finishTitle(value: string): void {
  finish(value);
}

/** A page whose canvas sits in a Loading beside an element waiting on a value. */
export function CanvasInLoading() {
  const title = createMemo(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  return (
    <Loading fallback={<p class="waiting">waiting</p>}>
      <h1 title={title()}>scene</h1>
      <Canvas gl={(defaults) => fakeRenderer(defaults.canvas as HTMLCanvasElement)}>
        <mesh name="in-canvas" />
      </Canvas>
    </Loading>
  );
}
