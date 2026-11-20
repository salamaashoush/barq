/**
 * The stylesheets a server-rendered page links, in both shapes Vite writes them.
 *
 * `build.cssCodeSplit: false` rendered the site unstyled. Vite writes the one
 * stylesheet in its own `generateBundle`, after barq's, and links it only from
 * an `index.html` it builds: no chunk lists it, so Start's client assets named
 * no stylesheet and `<HeadContent />` linked none. The gathering of atoms ran
 * before the sheet existed, so the sheet also kept the marker rule and every
 * atom in module order.
 *
 * Split, a build's atoms are a file of their own, linked last: an atom and a
 * `css` block class are both 0-1-0, and the later stylesheet wins.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const config = (split: boolean): string => `import barq from "@barqjs/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [barq({ ssr: true, start: { prerender: { routes: ["/"] } } })],
  build: { cssCodeSplit: ${split} },
});
`;

const INDEX = `import { atoms } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";

function Home() {
  return <h1 class={atoms({ color: "red" })}>barq</h1>;
}

export const Route = createFileRoute("/")({ prerender: true, component: Home });
`;

interface Linked {
  readonly tag: string;
  readonly href: string;
  readonly css: string;
}

async function prerendered(split: boolean): Promise<Linked[]> {
  const root = project("full-stack", {
    "vite.config.ts": config(split),
    "src/routes/index.tsx": INDEX,
  });
  const builder = await createBuilder({ root, configLoader: "runner", logLevel: "silent" });
  await builder.buildApp();
  const client = join(root, "dist", "client");
  const html = readFileSync(join(client, "index.html"), "utf8");
  return [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(([tag]) => {
    const href = /\bhref="([^"]+)"/.exec(tag)?.[1] ?? "";
    return { tag, href, css: readFileSync(join(client, href), "utf8") };
  });
}

describe("a server-rendered page's stylesheets", () => {
  let unsplit: Linked[];
  let split: Linked[];
  beforeAll(async () => {
    unsplit = await prerendered(false);
    split = await prerendered(true);
  }, 180_000);

  test("unsplit, the page links the one stylesheet", () => {
    expect(unsplit.length).toBe(1);
    const [sheet] = unsplit;
    expect(sheet?.css).toContain("max-width:48rem");
    expect(sheet?.css).toContain("system-ui");
  });

  test("unsplit, its atoms come after its blocks, and the marker is gone", () => {
    const css = unsplit[0]?.css ?? "";
    expect(css).not.toContain("__barq_atoms__");
    expect(css.match(/\.a-color_\w+\{color:red\}/g)?.length).toBe(1);
    expect(css.indexOf(".a-color_")).toBeGreaterThan(css.indexOf("max-width:48rem"));
  });

  test("split, the atoms are a file of their own, linked last and marked", () => {
    const last = split.at(-1);
    expect(last?.tag).toContain("data-barq-atoms");
    expect(last?.css).toMatch(/\.a-color_\w+\{color:red\}/);
    for (const sheet of split.slice(0, -1)) {
      expect(sheet.tag).not.toContain("data-barq-atoms");
      expect(sheet.css).not.toContain(".a-");
    }
    expect(split.some((sheet) => sheet.css.includes("max-width:48rem"))).toBe(true);
  });
});

const FIXTURE = fileURLToPath(new URL("./fixtures/atom-order", import.meta.url));

/** One build of the fixture in a process of its own, and its stylesheets by file. */
async function fixture(shape: "split" | "unsplit" | "lib"): Promise<Record<string, string>> {
  const out = mkdtempSync(join(tmpdir(), `barq-atom-order-${shape}-`));
  try {
    const child = Bun.spawn(["bun", join(FIXTURE, "build.ts"), shape, out], {
      cwd: FIXTURE,
      env: { ...process.env, NODE_ENV: "production" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, status] = await Promise.all([new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    const sheets: Record<string, string> = {};
    for (const file of readdirSync(out, { recursive: true }) as string[]) {
      if (file.endsWith(".css")) sheets[file] = readFileSync(join(out, file), "utf8");
      if (file.endsWith(".html")) sheets[file] = readFileSync(join(out, file), "utf8");
    }
    return sheets;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/**
 * Three modules in this order: a block with `padding:2rem` under a query, an
 * atom under the same query, and a block with `padding:0` under it. The
 * minifier wrote the first block and the atom in one `@media` block, which was
 * then read whole as an atom and moved behind the third block: `padding:0`,
 * the later block in dev, lost in the build, and the atom was left in the
 * chunk's sheet.
 */
describe("a block a minifier put under one query with an atom", () => {
  for (const shape of ["split", "unsplit", "lib"] as const) {
    test(`keeps its place before the later block, ${shape}`, async () => {
      const sheets = await fixture(shape);
      const css = Object.entries(sheets)
        .filter(([file]) => file.endsWith(".css"))
        .map(([, text]) => text);
      const blocks = css.find((text) => text.includes("padding:2rem")) ?? "";
      expect(blocks.indexOf("padding:2rem")).toBeLessThan(blocks.indexOf("padding:0"));
      const atom = css.find((text) => text.includes("padding-top:1px")) ?? "";
      expect(atom.indexOf("padding-top:1px")).toBeGreaterThan(atom.lastIndexOf("padding:0"));
      for (const text of css) expect(text).not.toContain("__barq_atoms__");
      if (shape === "split") {
        expect(blocks).not.toContain(".a-");
        expect(atom).not.toContain("padding:2rem");
      }
    }, 60_000);
  }

  test("a library names its one stylesheet after `cssFileName`, and it is finished too", async () => {
    const sheets = await fixture("lib");
    expect(Object.keys(sheets).filter((file) => file.endsWith(".css"))).toEqual(["mylib.css"]);
  }, 60_000);
});
