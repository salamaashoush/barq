/**
 * An atom beats a `css` block class on the same element for the same property,
 * in a browser, in every shape a page gets its stylesheets in.
 *
 * Both are 0-1-0, so order alone decides, and the atom is what a caller passes
 * to override. Each shape used to decide it differently: dev by which module
 * registered last, a split build by which chunk's sheet held the atoms and
 * which chunks were linked after it, an unsplit build by module order, and a
 * chunk a dynamic import brought after the first paint was appended after
 * everything and won outright.
 *
 * The fixture is `@barqjs/vite`'s: one atom declared in a module that runs
 * before the block's, one in a module that runs after it, and a lazily
 * imported module with a block of its own on an element carrying an atom.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { withChrome, type Page } from "./chrome.ts";
import { compileSourceRaw, TMP_DIR } from "./harness.ts";

const FIXTURE = fileURLToPath(new URL("../../vite/test/fixtures/atom-order", import.meta.url));
const RUNTIME = fileURLToPath(new URL("../../css/src/index.ts", import.meta.url));
const WORK = join(TMP_DIR, "atom-order");

const RED = "rgb(255, 0, 0)";
const ORANGE = "rgb(255, 165, 0)";

async function build(shape: "split" | "unsplit"): Promise<string> {
  const out = join(WORK, shape);
  const child = Bun.spawn(["bun", join(FIXTURE, "build.ts"), shape, out, `/${shape}/`], {
    cwd: FIXTURE,
    env: { ...process.env, NODE_ENV: "production" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, status] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  if (status !== 0) throw new Error(`the ${shape} build failed:\n${stderr}`);
  return out;
}

/**
 * What the dev server sends for the same modules: each one's compiled sheet,
 * registered with the runtime when the module runs, in the order they run.
 */
async function devPage(): Promise<string> {
  const out = join(WORK, "dev");
  mkdirSync(out, { recursive: true });
  const compiled = (name: string): { css: string; classes: string[] } => {
    const file = join(FIXTURE, "src", name);
    const css = compileSourceRaw(readFileSync(file, "utf8"), file).css ?? "";
    return {
      css,
      classes: [...css.matchAll(/^\.([\w-]+)\{|\}\.([\w-]+)\{/g)].map((m) => m[1] ?? m[2] ?? ""),
    };
  };
  const early = compiled("early.ts");
  const card = compiled("card.ts");
  const late = compiled("late.ts");
  const second = compiled("second.ts");
  const register = (name: string, css: string) =>
    `registerCss(${JSON.stringify(`/src/${name}.barq.css`)}, ${JSON.stringify(css)});`;
  writeFileSync(
    join(out, "entry.ts"),
    [
      `import { css, registerCss } from ${JSON.stringify(RUNTIME)};`,
      register("early.ts", early.css),
      register("card.ts", card.css),
      register("late.ts", late.css),
      `const app = document.querySelector("#app");`,
      `for (const [id, atom] of [["early", ${JSON.stringify(early.classes[0])}], ["late", ${JSON.stringify(late.classes[0])}]]) {`,
      `  const element = document.createElement("p");`,
      `  element.id = id;`,
      `  element.className = ${JSON.stringify(card.classes[0])} + " " + atom;`,
      `  app.append(element);`,
      `}`,
      `const runtime = document.createElement("p");`,
      `runtime.id = "runtime";`,
      `runtime.className = css\`color: \${String(document.documentElement.dataset.tone ?? "purple")};\` + " " + ${JSON.stringify(early.classes[0])};`,
      `app.append(runtime);`,
      `window.loadSecond = async () => {`,
      `  ${register("second.ts", second.css)}`,
      `  const element = document.createElement("p");`,
      `  element.id = "lazy";`,
      `  element.className = ${JSON.stringify(second.classes.join(" "))};`,
      `  app.append(element);`,
      `};`,
    ].join("\n"),
  );
  const built = await Bun.build({ entrypoints: [join(out, "entry.ts")], target: "browser" });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  writeFileSync(
    join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div>` +
      `<script type="module">${(await built.outputs[0]!.text()).replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
  );
  return out;
}

let roots: Record<"dev" | "split" | "unsplit", string>;
let server: Server;
let origin = "";
const SHAPE = /^\/(dev|split|unsplit)(\/.*)$/;
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

beforeAll(async () => {
  rmSync(WORK, { recursive: true, force: true });
  roots = { dev: await devPage(), split: await build("split"), unsplit: await build("unsplit") };
  // `node:http`, because the suite's preload puts happy-dom's `Response` on the
  // global and `Bun.serve` refuses one.
  server = createServer((request, response) => {
    const match = SHAPE.exec(new URL(request.url ?? "/", "http://localhost").pathname);
    const root = match === null ? undefined : roots[match[1] as keyof typeof roots];
    const path =
      root === undefined ? "" : join(root, match?.[2] === "/" ? "index.html" : (match?.[2] ?? ""));
    if (path === "" || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    response.end(readFileSync(path));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterAll(() => {
  server?.close();
  rmSync(WORK, { recursive: true, force: true });
});

/** The color each element computes, once it exists and every stylesheet is in. */
async function colors(page: Page, ids: readonly string[]): Promise<Record<string, string>> {
  const probe = `(() => {
    if (document.readyState !== "complete") return null;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.sheet === null)) return null;
    const out = {};
    for (const id of ${JSON.stringify(ids)}) {
      const element = document.getElementById(id);
      if (element === null) return null;
      out[id] = getComputedStyle(element).color;
    }
    return JSON.stringify(out);
  })()`;
  for (let attempt = 0; attempt < 200; attempt++) {
    const read = await page.evaluate<string | null>(probe);
    if (read !== null) return JSON.parse(read) as Record<string, string>;
    await Bun.sleep(25);
  }
  throw new Error(`never found ${ids.join(", ")}`);
}

describe("an atom against a css block class for one property", () => {
  for (const shape of ["dev", "split", "unsplit"] as const) {
    test(`the atom wins in ${shape === "dev" ? "the dev registry" : `a ${shape} build`}, declared before the block or after it, and after a chunk loads`, async () => {
      await withChrome(async (page) => {
        await page.open(`${origin}/${shape}/`);
        expect(await colors(page, ["early", "late", "runtime"])).toEqual({
          early: RED,
          late: ORANGE,
          runtime: RED,
        });

        await page.evaluate("window.loadSecond()");
        expect(await colors(page, ["early", "late", "lazy"])).toEqual({
          early: RED,
          late: ORANGE,
          lazy: RED,
        });
      });
    }, 60_000);
  }
});
