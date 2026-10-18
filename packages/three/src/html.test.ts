import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { flush, type JSXElement } from "@barqjs/core";
import * as THREE from "three";

import { LabelInErrored, LabelInLoading } from "./fixtures/html.tsx";
import { FakeLoader } from "./fixtures/loader.tsx";
import { createRoot } from "./renderer.ts";
import { fakeRenderer, manualFrames, type Frames } from "./test-utils.ts";

let frames: Frames;
let page: HTMLElement;
const unmounts: (() => void)[] = [];
beforeEach(() => {
  frames = manualFrames();
  page = document.body.appendChild(document.createElement("div"));
});
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  page.remove();
  frames.restore();
});

/** A root over a canvas that is in the document, so `Html` has somewhere to go. */
function mountInPage(code: () => JSXElement): THREE.Scene {
  const canvas = page.appendChild(document.createElement("canvas"));
  const root = createRoot(canvas);
  root.configure({
    gl: fakeRenderer(canvas),
    size: { width: 800, height: 600, top: 0, left: 0 },
  });
  root.render(code);
  flush();
  unmounts.push(() => root.unmount());
  return root.store.scene;
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flush();
  frames.step();
};

function label(): HTMLElement | null {
  return page.querySelector(".label");
}

/** The element `Html` positions: the one holding the content's `<div>`. */
function pinned(): HTMLElement {
  return label()!.parentElement!.parentElement!;
}

describe("Html under a boundary", () => {
  test("waits with the Loading it is in and shows its content once the load lands", async () => {
    const scene = mountInPage(() => LabelInLoading());
    await settle();
    expect(scene.getObjectByName("fallback")).toBeDefined();
    expect(scene.getObjectByName("labelled")).toBeUndefined();
    expect(label() === null || pinned().style.display === "none").toBe(true);

    FakeLoader.finish("html-wait.png", new THREE.Texture());
    await settle();
    expect(scene.getObjectByName("fallback")).toBeUndefined();
    expect(scene.getObjectByName("labelled")!.children).toHaveLength(2);
    expect(label()!.textContent).toBe("label");
    expect(pinned().style.display).toBe("block");
  });

  test("is torn down with the rest of the tree when the load fails", async () => {
    const scene = mountInPage(() => LabelInErrored());
    expect(scene.getObjectByName("fallback")).toBeDefined();

    FakeLoader.fail("html-fail.png", "gone");
    await settle();
    expect(scene.getObjectByName("failed")).toBeDefined();
    expect(scene.getObjectByName("labelled")).toBeUndefined();
    expect(label()).toBeNull();
  });
});
