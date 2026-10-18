import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSignal, flush } from "@barqjs/core";
import { render } from "@barqjs/web";

import * as THREE from "three";

import { App, renderers, setInline } from "./fixtures/app.tsx";
import { labelX, setLabelText, setLabelX } from "./fixtures/overlay.tsx";
import type { RootState } from "./store.ts";
import { manualFrames, type Frames } from "./test-utils.ts";

let frames: Frames;
let container: HTMLElement;
beforeEach(() => {
  frames = manualFrames();
  container = document.body.appendChild(document.createElement("div"));
  renderers.length = 0;
});
afterEach(() => {
  frames.restore();
  container.remove();
});

function mountApp(dpr?: () => number) {
  let state: RootState | null = null;
  const dispose = render(
    () =>
      App({
        onCreated: () => (created) => {
          state = created;
        },
        dpr,
      }),
    container,
  );
  flush();
  return { dispose, state: () => state! };
}

describe("<Canvas>", () => {
  test("renders a div holding a canvas and the scene its children describe", () => {
    const { dispose, state } = mountApp();
    const wrapper = container.querySelector("main > div.stage") as HTMLDivElement;
    expect(wrapper).not.toBe(null);
    expect(wrapper.style.position).toBe("relative");
    expect(wrapper.style.height).toBe("300px");
    const canvas = wrapper.querySelector("canvas")!;
    expect(renderers).toHaveLength(1);
    expect(renderers[0].domElement).toBe(canvas);
    expect(state().gl).toBe(renderers[0] as never);
    expect(state().scene.getObjectByName("box")).toBeDefined();
    expect(state().events.connected).toBe(wrapper);
    dispose();
    expect(state().scene.children).toHaveLength(0);
  });

  test("children written inline in the page compile for the scene and follow their signals", () => {
    const { dispose, state } = mountApp();
    const names = (): string[] =>
      state()
        .scene.children.filter((child) => child.name.startsWith("inline-"))
        .map((child) => child.name);
    expect(state().scene.children[0]).toBeInstanceOf(THREE.AmbientLight);
    expect(names()).toEqual(["inline-a", "inline-b"]);
    setInline(["b", "c"]);
    flush();
    frames.step();
    expect(names()).toEqual(["inline-b", "inline-c"]);
    dispose();
    setInline(["a", "b"]);
    flush();
  });

  test("a prop change configures the root again", () => {
    const [dpr, setDpr] = createSignal(1);
    const { dispose, state } = mountApp(dpr);
    expect(state().viewport.dpr).toBe(1);
    setDpr(2);
    flush();
    expect(state().viewport.dpr).toBe(2);
    expect(renderers[0].ratio).toBe(2);
    dispose();
  });

  test("Html pins document content to a point of the scene and follows it", () => {
    const { dispose, state } = mountApp();
    state().setSize(800, 600);
    frames.step();
    const wrapper = container.querySelector("div.stage") as HTMLDivElement;
    const label = wrapper.querySelector("span.label") as HTMLSpanElement;
    expect(label).not.toBe(null);
    expect(label.textContent).toBe("salama");
    const pinned = label.parentElement!.parentElement as HTMLDivElement;
    expect(pinned.style.transform).toBe("translate3d(400px,300px,0) scale(1)");
    expect(label.parentElement!.style.transform).toBe("translate3d(-50%,-50%,0)");

    setLabelText("acme");
    flush();
    expect(label.textContent).toBe("acme");

    setLabelX(labelX() + 1);
    flush();
    frames.step();
    expect(pinned.style.transform).not.toBe("translate3d(400px,300px,0) scale(1)");

    dispose();
    expect(wrapper.querySelector("span.label")).toBe(null);
    setLabelX(0);
    setLabelText("salama");
    flush();
  });
});
