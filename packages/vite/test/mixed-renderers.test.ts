/**
 * One Vite build holding document files and a custom renderer's files, the
 * second kind picked out by `compiler.renderers`. The bundle is then run: the
 * document half renders into happy-dom and the custom half into its own host,
 * and both follow the same signals.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

import barq from "../src/index.ts";
import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const RENDERER = `import { createRenderer } from "@barqjs/universal";

export interface SceneNode {
  tag: string;
  text: string;
  props: Record<string, unknown>;
  parent: SceneNode | null;
  children: SceneNode[];
}

const make = (tag: string, text = ""): SceneNode => ({ tag, text, props: {}, parent: null, children: [] });

function detach(node: SceneNode): void {
  if (node.parent === null) return;
  node.parent.children.splice(node.parent.children.indexOf(node), 1);
  node.parent = null;
}

export const {
  render,
  createElement,
  createTextNode,
  insertNode,
  setProp,
  insert,
  spread,
  branch,
  each,
  boundary,
  island,
  reveal,
  portal,
  dynamic,
  Portal,
} = createRenderer<SceneNode>({
  createElement: (tag) => make(tag),
  createTextNode: (value) => make("#text", value),
  replaceText: (node, value) => {
    node.text = value;
  },
  isTextNode: (node) => node.tag === "#text",
  setProperty: (node, name, value) => {
    node.props[name] = value;
  },
  insertNode: (parent, node, anchor) => {
    detach(node);
    const at = anchor === null ? parent.children.length : parent.children.indexOf(anchor);
    parent.children.splice(at, 0, node);
    node.parent = parent;
  },
  removeNode: (_parent, node) => detach(node),
  getParentNode: (node) => node.parent,
  getFirstChild: (node) => node.children[0] ?? null,
  getNextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
});

export const createScene = (): SceneNode => make("scene");

export function print(node: SceneNode): string {
  if (node.tag === "#text") return node.text;
  const props = Object.keys(node.props)
    .sort()
    .filter((name) => typeof node.props[name] !== "function")
    .map((name) => " " + name + "=" + String(node.props[name]))
    .join("");
  return "<" + node.tag + props + ">" + node.children.map(print).join("") + "</" + node.tag + ">";
}
`;

const FILES = {
  "src/state.ts": `import { createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(1);
export const [items, setItems] = createSignal(["a", "b"]);
`,
  "src/scene/renderer.ts": RENDERER,
  "src/scene/Scene.tsx": `import { For, Show } from "@barqjs/core";
import { count, items } from "../state.ts";

export function Scene() {
  return (
    <group name="scene">
      <label text={"count " + count()} />
      <Show when={count() > 1}>
        <badge />
      </Show>
      <For each={items()}>{(item) => <sprite id={item} />}</For>
    </group>
  );
}
`,
  "src/page/App.tsx": `import { count, setCount } from "../state.ts";

export function App() {
  return (
    <main>
      <h1>{count()}</h1>
      <button type="button" onClick={() => setCount(count() + 10)}>add</button>
    </main>
  );
}
`,
  "src/main.ts": `import { render } from "@barqjs/web";
import { App } from "./page/App.tsx";
import { Scene } from "./scene/Scene.tsx";
import { createScene, print, render as renderScene } from "./scene/renderer.ts";

export { flush } from "@barqjs/core";
export { setCount, setItems } from "./state.ts";

export function mount(element: HTMLElement) {
  const scene = createScene();
  const disposeDom = render(App, element);
  const disposeScene = renderScene(Scene, scene);
  return {
    scene: () => print(scene),
    dispose() {
      disposeDom();
      disposeScene();
    },
  };
}
`,
};

describe("a build with document files and a custom renderer's files", () => {
  let root = "";
  beforeAll(async () => {
    root = project(null, FILES);
    await build({
      root,
      logLevel: "silent",
      configFile: false,
      plugins: [
        barq({
          compiler: {
            renderers: [
              {
                include: ["src/scene/**"],
                target: "universal",
                moduleSource: "/src/scene/renderer.ts",
              },
            ],
          },
        }),
      ],
      build: {
        minify: false,
        lib: { entry: "src/main.ts", formats: ["es"], fileName: () => "main.js" },
      },
    });
  }, 120_000);

  test("compiles each file for its own renderer", () => {
    const code = readFileSync(join(root, "dist", "main.js"), "utf8");
    // The document's templates for the page, and calls to the custom host for
    // the scene, in one bundle.
    expect(code).toContain("<main><h1>");
    expect(code).toContain('createElement("sprite")');
    expect(code).not.toContain("<group");
  });

  test("renders both halves and keeps both on the same signals", () => {
    const run = Bun.spawnSync(
      ["bun", join(import.meta.dir, "mixed-renderers-run.ts"), join(root, "dist", "main.js")],
      { cwd: root },
    );
    expect(run.stderr.toString()).toBe("");
    const frames = JSON.parse(run.stdout.toString()) as { dom: string; scene: string }[];
    expect(frames).toEqual([
      {
        dom: '<main><h1>1</h1><button type="button">add</button></main>',
        scene:
          "<scene><group name=scene><label text=count 1></label><sprite id=a></sprite><sprite id=b></sprite></group></scene>",
      },
      {
        dom: '<main><h1>2</h1><button type="button">add</button></main>',
        scene:
          "<scene><group name=scene><label text=count 2></label><badge></badge><sprite id=b></sprite><sprite id=c></sprite><sprite id=a></sprite></group></scene>",
      },
      {
        dom: '<main><h1>12</h1><button type="button">add</button></main>',
        scene:
          "<scene><group name=scene><label text=count 12></label><badge></badge><sprite id=b></sprite><sprite id=c></sprite><sprite id=a></sprite></group></scene>",
      },
      { dom: "", scene: "<scene></scene>" },
    ]);
  });
});
