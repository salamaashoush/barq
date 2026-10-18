/**
 * Renderer boundaries, end to end: one module whose document JSX holds a
 * `Canvas` whose children build on the in-memory host, which in turn holds an
 * `Html` whose children build in the document again. The module is compiled
 * once, rendered in happy-dom, and every signal it owns has to reach all three
 * places it is read.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { TEXT, type TestNode } from "../../universal/src/test-host.ts";
import {
  TMP_DIR,
  compileSource,
  compileSourceRaw,
  haltsHeld,
  loadModule,
  settle,
  writeSibling,
} from "./harness.ts";
import { host, wire } from "./hydration.ts";

const RENDERER = join(import.meta.dir, "universal-renderer.ts");
const COMPONENTS = join(import.meta.dir, "boundary-components.ts");

const BOUNDARIES = [
  { source: COMPONENTS, name: "Canvas", target: "universal", moduleSource: RENDERER },
  { source: COMPONENTS, name: "Html", target: "dom", moduleSource: "@barqjs/web" },
];

const SOURCE = `
import { createSignal, Show } from "@barqjs/core";
import { Canvas, Html } from ${JSON.stringify(COMPONENTS)};
export const [title, setTitle] = createSignal("salama");
export const [count, setCount] = createSignal(1);
export const [on, setOn] = createSignal(true);
export function App() {
  return (
    <main>
      <h1>{title()}</h1>
      <Canvas>
        <box label={title()} size={count()}>{count()}</box>
        <Show when={on()}>
          <leaf />
        </Show>
        <Html>
          <p class="tip">{title()}:{count()}</p>
        </Html>
      </Canvas>
    </main>
  );
}
`;

interface Scene {
  App: () => unknown;
  setTitle: (value: string) => void;
  setCount: (value: number) => void;
  setOn: (value: boolean) => void;
}

interface Components {
  scenes: TestNode[];
  overlays: HTMLElement[];
}

/** The host tree as markup, with the empty text a hole anchors on left out. */
function shape(node: TestNode): string {
  if (node.tag === TEXT) return node.text === "" ? "" : JSON.stringify(node.text);
  const props = Object.entries(node.props)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ` ${name}=${JSON.stringify(value)}`)
    .join("");
  return `<${node.tag}${props}>${node.children.map(shape).join("")}</${node.tag}>`;
}

function compile(options: Record<string, unknown> = {}) {
  return compileSourceRaw(SOURCE, "scene.tsx", { boundaries: BOUNDARIES, ...options });
}

describe("renderer boundaries", () => {
  test("the module imports each renderer's helpers once, under names of their own", () => {
    const { code } = compile();
    const importsOf = (source: string) =>
      code
        .split("\n")
        .filter((line) => line.startsWith("import {") && line.endsWith(`"${source}";`));
    const [web] = importsOf("@barqjs/web");
    const [renderer] = importsOf(RENDERER);
    expect(importsOf("@barqjs/web")).toHaveLength(1);
    expect(importsOf(RENDERER)).toHaveLength(1);
    expect(web).toMatch(/insert as _\$insert[ ,]/);
    expect(renderer).toContain("insert as _$insert$1");
    expect(renderer).toContain("createElement as _$createElement$1");
    expect(code).not.toContain("<box");
  });

  test("one signal reaches the document, the custom host and the document inside it", async () => {
    const web = await import("@barqjs/web");
    const components = (await import(COMPONENTS)) as Components;
    const module = (await loadModule(compile().code, "boundary")) as unknown as Scene;

    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = web.render(() => module.App() as never, container);
    await settle();

    const scene = components.scenes.at(-1)!;
    const overlay = components.overlays.at(-1)!;
    expect(container.innerHTML).toBe(
      `<main><h1>salama</h1><canvas data-scene="${scene.id}"></canvas></main>`,
    );
    expect(scene.children.map(shape).join("")).toBe(
      '<box label="salama" size=1>"1"</box><leaf></leaf><html></html>',
    );
    expect(overlay.innerHTML).toBe('<p class="tip">salama:1</p>');

    module.setTitle("example.com");
    module.setCount(2);
    module.setOn(false);
    await settle();

    expect(container.querySelector("h1")!.textContent).toBe("example.com");
    expect(scene.children.map(shape).join("")).toBe(
      '<box label="example.com" size=2>"2"</box><html></html>',
    );
    expect(overlay.innerHTML).toBe('<p class="tip">example.com:2</p>');

    // The scene's root is owned by the component that mounted it.
    dispose();
    expect(scene.children).toHaveLength(0);
    expect(overlay.innerHTML).toBe("");
    container.remove();
  });

  test("the server renders the boundary and none of a custom renderer's children", () => {
    const { code } = compile({ ssr: true, hydratable: true });
    expect(code).toContain("Canvas({})");
    for (const absent of ["box", "leaf", "Html(", RENDERER]) expect(code).not.toContain(absent);
  });

  test("a component declared beside the page builds on the host its tags are claimed by", async () => {
    const web = await import("@barqjs/web");
    const components = (await import(COMPONENTS)) as Components;
    const source = `
import { createSignal } from "@barqjs/core";
import { Canvas } from ${JSON.stringify(COMPONENTS)};
export const [size, setSize] = createSignal(1);
function Box() {
  return <box size={size()}><leaf /></box>;
}
export function App() {
  return <main><h1>{size()}</h1><Canvas><Box /></Canvas></main>;
}
`;
    const { code } = compileSourceRaw(source, "scene.tsx", {
      boundaries: BOUNDARIES,
      intrinsics: [{ tags: ["box", "leaf"], target: "universal", moduleSource: RENDERER }],
    });
    expect(code).not.toContain("<box");
    const module = (await loadModule(code, "boundary-intrinsics")) as unknown as {
      App: () => unknown;
      setSize: (value: number) => void;
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = web.render(() => module.App() as never, container);
    await settle();
    const scene = components.scenes.at(-1)!;
    expect(container.querySelector("h1")!.textContent).toBe("1");
    expect(scene.children.map(shape).join("")).toBe("<box size=1><leaf></leaf></box>");

    module.setSize(2);
    await settle();
    expect(container.querySelector("h1")!.textContent).toBe("2");
    expect(scene.children.map(shape).join("")).toBe("<box size=2><leaf></leaf></box>");
    dispose();
    container.remove();
  });

  test("control flow around components alone builds on the host of the root it renders in", async () => {
    const web = await import("@barqjs/web");
    const components = (await import(COMPONENTS)) as Components;
    // Scene and Choice name no element, so they compile for the document and
    // find the scene's host at run time.
    const source = `
import { createSignal, Errored, For, Loading, Match, Repeat, Show, Switch } from "@barqjs/core";
import { Canvas } from ${JSON.stringify(COMPONENTS)};
export const [xs, setXs] = createSignal(["a", "b", "c"]);
export const [on, setOn] = createSignal(true);
export const [mode, setMode] = createSignal("one");
export const [count, setCount] = createSignal(2);
function Box(props) {
  return <box x={props.x} />;
}
function Leaf() {
  return <leaf />;
}
function Broken() {
  throw new Error("salama");
}
function Scene() {
  return <For each={xs()}>{(x) => <Box x={x} />}</For>;
}
function Rows() {
  return <For each={xs()} keyed={false}>{(x) => <Box x={x()} />}</For>;
}
function Choice() {
  return (
    <Show when={on()} fallback={<Leaf />}>
      <Box x="on" />
    </Show>
  );
}
function Modes() {
  return (
    <Switch fallback={<Leaf />}>
      <Match when={mode() === "one"}><Box x="one" /></Match>
      <Match when={mode() === "two"}><Box x="two" /></Match>
    </Switch>
  );
}
function Counted() {
  return <Repeat count={count()}>{(i) => <Box x={i} />}</Repeat>;
}
function Guarded() {
  return (
    <Errored fallback={<Leaf />}>
      <Loading fallback={<Leaf />}>
        <Broken />
      </Loading>
    </Errored>
  );
}
export const parts = { Scene, Rows, Choice, Modes, Counted, Guarded };
export function App(props) {
  const Part = parts[props.part];
  return <main><Canvas><Part /></Canvas></main>;
}
`;
    const { code } = compileSourceRaw(source, "scene.tsx", {
      boundaries: BOUNDARIES,
      intrinsics: [{ tags: ["box", "leaf"], target: "universal", moduleSource: RENDERER }],
    });
    const module = (await loadModule(code, "boundary-foreign-flow")) as unknown as {
      App: (props: { part: string }) => unknown;
      setXs: (value: string[]) => void;
      setOn: (value: boolean) => void;
      setMode: (value: string) => void;
      setCount: (value: number) => void;
    };
    const mount = async (part: string) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const dispose = web.render(() => module.App({ part }) as never, container);
      await settle();
      const scene = components.scenes.at(-1)!;
      return {
        tree: () => scene.children.map(shape).join(""),
        dispose: () => {
          dispose();
          container.remove();
          expect(scene.children).toHaveLength(0);
        },
      };
    };
    const boxes = (...xs: (string | number)[]) =>
      xs.map((x) => `<box x=${JSON.stringify(x)}></box>`).join("");

    for (const part of ["Scene", "Rows"]) {
      module.setXs(["a", "b", "c"]);
      const list = await mount(part);
      expect(list.tree()).toBe(boxes("a", "b", "c"));
      module.setXs(["c", "a", "b"]);
      await settle();
      expect(list.tree()).toBe(boxes("c", "a", "b"));
      module.setXs(["c", "d", "a", "b"]);
      await settle();
      expect(list.tree()).toBe(boxes("c", "d", "a", "b"));
      module.setXs(["d", "b"]);
      await settle();
      expect(list.tree()).toBe(boxes("d", "b"));
      module.setXs([]);
      await settle();
      expect(list.tree()).toBe("");
      list.dispose();
    }

    module.setOn(true);
    const choice = await mount("Choice");
    expect(choice.tree()).toBe(boxes("on"));
    module.setOn(false);
    await settle();
    expect(choice.tree()).toBe("<leaf></leaf>");
    module.setOn(true);
    await settle();
    expect(choice.tree()).toBe(boxes("on"));
    choice.dispose();

    module.setMode("one");
    const modes = await mount("Modes");
    expect(modes.tree()).toBe(boxes("one"));
    module.setMode("two");
    await settle();
    expect(modes.tree()).toBe(boxes("two"));
    module.setMode("none");
    await settle();
    expect(modes.tree()).toBe("<leaf></leaf>");
    modes.dispose();

    module.setCount(2);
    const counted = await mount("Counted");
    expect(counted.tree()).toBe(boxes(0, 1));
    module.setCount(3);
    await settle();
    expect(counted.tree()).toBe(boxes(0, 1, 2));
    counted.dispose();

    const guarded = await mount("Guarded");
    expect(guarded.tree()).toBe("<leaf></leaf>");
    guarded.dispose();
  });

  test("a document element in such a body is refused with the construct named", async () => {
    const web = await import("@barqjs/web");
    const source = `
import { For } from "@barqjs/core";
import { Canvas } from ${JSON.stringify(COMPONENTS)};
function Scene() {
  return <For each={["a"]}>{(x) => <div>{x}</div>}</For>;
}
export function App() {
  return <main><Canvas><Scene /></Canvas></main>;
}
`;
    const { code } = compileSourceRaw(source, "scene.tsx", { boundaries: BOUNDARIES });
    const module = (await loadModule(code, "boundary-foreign-refused")) as unknown as {
      App: () => unknown;
    };
    const container = document.createElement("div");
    // The throw halts the engine, as any error nothing catches does.
    await haltsHeld(async () => {
      expect(() => web.render(() => module.App() as never, container)).toThrow(
        /a list such as `<For>` in another renderer's tree built a node that tree cannot hold/,
      );
    });
  });
});

/**
 * A boundary written in JSX, as a package ships one: the server renders its
 * `<canvas>`, and the client claims that node and mounts the scene from its
 * ref, which never runs on the server. The scene mounts while the page
 * hydrates, and so does the document overlay inside it, which the server
 * never wrote and which must therefore claim nothing.
 */
const CANVAS = `
import { getOwner, onCleanup } from "@barqjs/core";
import { render as renderDocument } from "@barqjs/web";
import { host, render } from ${JSON.stringify(RENDERER)};
export const scenes = [];
export const overlays = [];
export function Canvas(props) {
  const owner = getOwner();
  return (
    <canvas
      ref={() => {
        const scene = host.root("scene");
        scenes.push(scene);
        return render(() => props.children, scene, { owner });
      }}
    />
  );
}
export function Html(props) {
  const overlay = document.createElement("div");
  overlays.push(overlay);
  onCleanup(renderDocument(() => props.children, overlay, { owner: getOwner() }));
  return host.ops.createElement("html");
}
`;

const PAGE = `
import { createSignal } from "@barqjs/core";
import { Canvas, Html } from "./CANVAS";
export const [count, setCount] = createSignal(1);
export default function Page() {
  return (
    <main>
      <h1>{count()}</h1>
      <Canvas>
        <box size={count()} />
        <Html>
          <p class="tip">{count()}</p>
        </Html>
      </Canvas>
    </main>
  );
}
`;

describe("a boundary on a hydrated page", () => {
  test("the server's element is claimed and its children mount on the host", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const build = (mode: "dom" | "ssr") => {
      const canvas = `boundary-canvas-${process.pid}-${mode}.tsx`;
      const ssr = mode === "ssr";
      writeSibling(canvas, compileSource(CANVAS, canvas, { ssr, hydratable: true }));
      const boundaries = [
        { source: `./${canvas}`, name: "Canvas", target: "universal", moduleSource: RENDERER },
        { source: `./${canvas}`, name: "Html", target: "dom", moduleSource: "@barqjs/web" },
      ];
      return compileSource(PAGE.replace("./CANVAS", `./${canvas}`), "page.tsx", {
        ssr,
        hydratable: true,
        boundaries,
      });
    };
    const server = await loadModule(build("ssr"), "boundary-page-ssr");
    const client = (await loadModule(build("dom"), "boundary-page-dom")) as unknown as {
      default: () => unknown;
      setCount: (value: number) => void;
    };
    const markup = wire(server);
    expect(markup).not.toContain("box");
    expect(markup).not.toContain("tip");

    const page = host(markup);
    const served = page.querySelector("canvas");
    expect(served).not.toBeNull();
    const stop = web.hydrate(client.default as never, page);
    core.flush();
    try {
      expect(web.hydrate.report.mismatches).toEqual([]);
      expect(page.querySelector("canvas")).toBe(served);
      const { scenes, overlays } = (await import(
        join(TMP_DIR, `boundary-canvas-${process.pid}-dom.tsx`)
      )) as { scenes: TestNode[]; overlays: HTMLElement[] };
      const scene = scenes.at(-1)!;
      const overlay = overlays.at(-1)!;
      expect(scene.children.map(shape).join("")).toBe("<box size=1></box><html></html>");
      expect(overlay.innerHTML).toBe('<p class="tip">1</p>');

      client.setCount(2);
      await settle();
      expect(page.querySelector("h1")!.textContent).toBe("2");
      expect(scene.children.map(shape).join("")).toBe("<box size=2></box><html></html>");
      expect(overlay.innerHTML).toBe('<p class="tip">2</p>');
    } finally {
      stop();
      page.remove();
    }
  });
});
