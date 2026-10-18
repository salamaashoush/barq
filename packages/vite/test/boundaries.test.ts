/**
 * A renderer found with no configuration. The project installs a package
 * whose `package.json` declares its `Canvas` a boundary into its own renderer
 * and claims its scene tags from a JSON file. The page holds a `Canvas`
 * beside document markup, and the scene is made of components declared
 * outside it: in a file of their own, and beside the page. The bundle is then
 * run: the page renders into happy-dom, the scene into the package's host,
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

const make = (tag, text = "") => ({ tag, text, props: {}, parent: null, children: [] });

function detach(node) {
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
} = createRenderer({
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

export const createScene = () => make("scene");

export function print(node) {
  if (node.tag === "#text") return node.text;
  const props = Object.keys(node.props)
    .sort()
    .filter((name) => typeof node.props[name] !== "function")
    .map((name) => " " + name + "=" + String(node.props[name]))
    .join("");
  return "<" + node.tag + props + ">" + node.children.map(print).join("") + "</" + node.tag + ">";
}
`;

const CANVAS = `import { getOwner, onCleanup } from "@barqjs/core";
import { createScene, render } from "./renderer.js";

export const scenes = [];

export function Canvas(props) {
  const scene = createScene();
  scenes.push(scene);
  onCleanup(render(() => props.children, scene, { owner: getOwner() }));
  return document.createElement("canvas");
}
`;

const FILES = {
  "package.json": JSON.stringify({
    name: "salama-scene-app",
    private: true,
    type: "module",
    dependencies: { "@acme/scene": "1.0.0" },
  }),
  "node_modules/@acme/scene/package.json": JSON.stringify({
    name: "@acme/scene",
    version: "1.0.0",
    type: "module",
    exports: { ".": "./index.js", "./renderer": "./renderer.js" },
    barq: {
      boundaries: [{ name: "Canvas", target: "universal", moduleSource: "@acme/scene/renderer" }],
      intrinsics: [
        { tags: "./tags.json", target: "universal", moduleSource: "@acme/scene/renderer" },
      ],
    },
  }),
  "node_modules/@acme/scene/tags.json": JSON.stringify(["group", "counter", "badge", "sprite"]),
  "node_modules/@acme/scene/index.js": CANVAS,
  "node_modules/@acme/scene/renderer.js": RENDERER,
  "src/state.ts": `import { createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(1);
export const [items, setItems] = createSignal(["a", "b"]);
`,
  // A file of scene components and nothing else, written outside any Canvas.
  "src/Scene.tsx": `import { For, Show } from "@barqjs/core";
import { count, items } from "./state.ts";

const Badge = () => <badge />;

export function Scene(props: { children?: unknown }) {
  return (
    <group name="scene">
      {props.children}
      <Show when={count() > 1}>
        <Badge />
      </Show>
      <For each={items()}>{(item) => <sprite id={item} />}</For>
    </group>
  );
}
`,
  // A scene component declared beside the page's own markup.
  "src/App.tsx": `import { Canvas } from "@acme/scene";
import { Scene } from "./Scene.tsx";
import { count, setCount } from "./state.ts";

function Counter() {
  return <counter text={"count " + count()} />;
}

export function App() {
  return (
    <main>
      <h1>{count()}</h1>
      <button type="button" onClick={() => setCount(count() + 10)}>add</button>
      <Canvas>
        <Scene>
          <Counter />
        </Scene>
      </Canvas>
    </main>
  );
}
`,
  "src/main.ts": `import { render } from "@barqjs/web";
import { scenes } from "@acme/scene";
import { print } from "@acme/scene/renderer";
import { App } from "./App.tsx";

export { flush } from "@barqjs/core";
export { setCount, setItems } from "./state.ts";

export function mount(element: HTMLElement) {
  const dispose = render(App, element);
  const scene = scenes[scenes.length - 1];
  return { scene: () => print(scene), dispose };
}
`,
};

describe("a renderer a dependency declares in its package.json", () => {
  let root = "";
  beforeAll(async () => {
    root = project(null, FILES);
    await build({
      root,
      logLevel: "silent",
      configFile: false,
      plugins: [barq()],
      build: {
        minify: false,
        lib: { entry: "src/main.ts", formats: ["es"], fileName: () => "main.js" },
      },
    });
  }, 120_000);

  test("compiles the page for the document and the canvas's children for the package's renderer", () => {
    const code = readFileSync(join(root, "dist", "main.js"), "utf8");
    expect(code).toContain("<main><h1>");
    expect(code).toMatch(/createElement(\$\d+)?\("sprite"\)/);
    for (const tag of ["<group", "<counter", "<badge", "<sprite"]) expect(code).not.toContain(tag);
  });

  test("renders both and keeps both on the same signals", () => {
    const run = Bun.spawnSync(
      ["bun", join(import.meta.dir, "mixed-renderers-run.ts"), join(root, "dist", "main.js")],
      { cwd: root },
    );
    expect(run.stderr.toString()).toBe("");
    const frames = JSON.parse(run.stdout.toString()) as { dom: string; scene: string }[];
    const page = (count: number) =>
      `<main><h1>${count}</h1><button type="button">add</button><canvas></canvas></main>`;
    expect(frames).toEqual([
      {
        dom: page(1),
        scene:
          "<scene><group name=scene><counter text=count 1></counter><sprite id=a></sprite><sprite id=b></sprite></group></scene>",
      },
      {
        dom: page(2),
        scene:
          "<scene><group name=scene><counter text=count 2></counter><badge></badge><sprite id=b></sprite><sprite id=c></sprite><sprite id=a></sprite></group></scene>",
      },
      {
        dom: page(12),
        scene:
          "<scene><group name=scene><counter text=count 12></counter><badge></badge><sprite id=b></sprite><sprite id=c></sprite><sprite id=a></sprite></group></scene>",
      },
      { dom: "", scene: "<scene></scene>" },
    ]);
  });
});
