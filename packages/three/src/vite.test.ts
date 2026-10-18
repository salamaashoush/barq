/**
 * An application that installs this package and configures nothing. Vite's
 * barq plugin reads `"barq"` from this package's `package.json`: `<Canvas>`'s
 * children compile for the scene, and so does a component in a file of its
 * own whose JSX is three's tags. The bundle is then run.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "vite";

import barq from "@barqjs/vite";

const PACKAGES = join(import.meta.dir, "..", "..");
const OWN_MODULES = join(import.meta.dir, "..", "node_modules");

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "salama-three-app",
    private: true,
    type: "module",
    dependencies: { "@barqjs/three": "0.1.0", three: "0.186.1" },
  }),
  "src/state.ts": `import { createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(1);
`,
  // Scene components in a file of their own: no pragma, no configuration.
  "src/scene.tsx": `import { For } from "@barqjs/core";
import { count } from "./state.ts";

export function Boxes() {
  return (
    <group name="boxes">
      <For each={Array.from({ length: count() }, (_, i) => i)}>
        {(i) => (
          <mesh name={"box-" + i} position-x={i}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="orange" />
          </mesh>
        )}
      </For>
    </group>
  );
}
`,
  "src/App.tsx": `import { Canvas, type RootState } from "@barqjs/three";
import { Boxes } from "./scene.tsx";
import { count } from "./state.ts";

export const states: RootState[] = [];

const gl = (defaults: { canvas: HTMLCanvasElement }) => ({
  domElement: defaults.canvas,
  render() {},
  setSize() {},
  setPixelRatio() {},
});

export function App() {
  return (
    <main>
      <h1>{count()}</h1>
      <Canvas gl={gl} onCreated={(state) => states.push(state)}>
        <ambientLight intensity={0.5} />
        <mesh name="inline" scale={count()} />
        <Boxes />
      </Canvas>
    </main>
  );
}
`,
  "src/main.ts": `import { render } from "@barqjs/web";
import { App, states } from "./App.tsx";

export { flush } from "@barqjs/core";
export { setCount } from "./state.ts";

export function mount(element: HTMLElement) {
  const dispose = render(App, element);
  const scene = () => {
    const names: string[] = [];
    states[states.length - 1]?.scene.traverse((object) => {
      if (object.name !== "") names.push(object.name + (object.name === "inline" ? ":" + object.scale.x : ""));
    });
    return names;
  };
  return { scene, dispose };
}
`,
};

let root = "";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "barq-three-vite-"));
  for (const [path, contents] of Object.entries(FILES)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  const modules = join(root, "node_modules");
  mkdirSync(join(modules, "@barqjs"), { recursive: true });
  for (const name of ["core", "web", "universal", "three", "compiler", "vite"]) {
    symlinkSync(join(PACKAGES, name), join(modules, "@barqjs", name));
  }
  symlinkSync(join(OWN_MODULES, "three"), join(modules, "three"));
  await build({
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [barq()],
    build: {
      minify: false,
      lib: { entry: "src/main.ts", formats: ["es"], fileName: () => "main.js" },
      rollupOptions: { external: ["three"] },
    },
  });
}, 120_000);

afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the canvas's children and a file of three's tags compile for the scene with no configuration", () => {
  const code = readFileSync(join(root, "dist", "main.js"), "utf8");
  expect(code).toMatch(/createElement(\$\d+)?\("mesh"\)/);
  expect(code).toMatch(/createElement(\$\d+)?\("boxGeometry"\)/);
  expect(code).not.toContain("<mesh");
  expect(code).toContain("<main><h1>");
});

test("the page and its scene render, and follow the same signal", () => {
  const run = Bun.spawnSync(
    ["bun", join(import.meta.dir, "test-vite-run.ts"), join(root, "dist", "main.js")],
    { cwd: root },
  );
  expect(run.stderr.toString()).toBe("");
  const frames = JSON.parse(run.stdout.toString()) as { dom: string; scene: string[] }[];
  expect(frames).toEqual([
    { dom: "<h1>1</h1>", scene: ["inline:1", "boxes", "box-0"] },
    { dom: "<h1>3</h1>", scene: ["inline:3", "boxes", "box-0", "box-1", "box-2"] },
    { dom: "", scene: [] },
  ]);
});
