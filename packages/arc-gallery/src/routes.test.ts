import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

import type { GroupCatalog } from "./gallery/types.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

// The catalogs alone, which are data: the pages themselves are JSX for Vite to compile.
const CATALOGS: readonly GroupCatalog[] = await Promise.all(
  [...new Bun.Glob("examples/*/catalog.ts").scanSync({ cwd: import.meta.dir })]
    .toSorted()
    .map(async (file) => ((await import(`./${file}`)) as { catalog: GroupCatalog }).catalog),
);
const pathOf = (catalog: GroupCatalog): string => `/${catalog.slug}`;

/** Every page the gallery has, and the same pages as the viewport frame and an RTL reader ask for them. */
const PATHS: readonly string[] = [
  "/",
  ...CATALOGS.map((catalog) => pathOf(catalog)),
  ...CATALOGS.map(
    (catalog) => `${pathOf(catalog)}?embed=1&dir=rtl&density=compact&theme=acme&contrast=high`,
  ),
];

/** What the dev server prints when a page or a module fails. */
const FAILURE = /threw while rendering|Internal server error|Error \[ERR_|BARQ\d+ error/;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        resolve(typeof address === "object" && address !== null ? address.port : 0),
      );
    });
  });
}

let base = "";
let server: ReturnType<typeof Bun.spawn> | undefined;
let printed = "";

/**
 * `bun run dev` as it runs for real: Vite on Node, which loads every
 * dependency the server render leaves external. Bun resolves imports Node
 * refuses, so a server started inside this process would pass a page that
 * fails in the dev server.
 */
beforeAll(async () => {
  const port = await freePort();
  const vite = `${root}node_modules/.bin/vite`;
  server = Bun.spawn(["node", vite, "--port", String(port), "--strictPort"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const collect = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) printed += decoder.decode(chunk);
  };
  void collect(server.stdout as ReadableStream<Uint8Array>);
  void collect(server.stderr as ReadableStream<Uint8Array>);
  base = `http://localhost:${port}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (printed.includes("ready in")) return;
    await Bun.sleep(100);
  }
  throw new Error(`the dev server did not start:\n${printed}`);
}, 60_000);

afterAll(() => {
  server?.kill();
});

describe("every route", () => {
  for (const path of PATHS) {
    test(`${path} renders on the server without an error`, async () => {
      const before = printed.length;
      const response = await fetch(`${base}${path}`);
      const html = await response.text();
      await Bun.sleep(50);
      const failures = printed
        .slice(before)
        .split("\n")
        .filter((line) => FAILURE.test(line));
      expect({ path, status: response.status, failures }).toEqual({
        path,
        status: 200,
        failures: [],
      });
      expect(html).toContain("</html>");
      expect(html).not.toContain("Missing example");

      const catalog = CATALOGS.find((each) => path.split("?")[0] === pathOf(each));
      if (catalog !== undefined) {
        // Every example the catalog lists rendered its card.
        const cards = html.split('data-slot="gallery-example"').length - 1;
        expect(cards).toBe(catalog.examples.length);
        expect(catalog.examples.length).toBeGreaterThan(0);
      }
    }, 120_000);
  }
});
