/**
 * `isServer` is a literal on each side, decided by export condition, so a
 * bundler drops the branch the other side takes. Solid 2.0 ships `isServer`
 * the same way, and code written `if (isServer)` relies on it.
 */

import { afterAll, expect, test } from "bun:test";
import { type InlineConfig, build } from "vite";

import barq from "../src/index.ts";
import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const ENTRY = `import { isServer } from "@barqjs/core";
export function where(): string {
  if (isServer) return "SERVER_ONLY_BRANCH";
  return "CLIENT_ONLY_BRANCH";
}
`;

async function bundled(config: (root: string) => InlineConfig): Promise<string> {
  const root = project(null, { "src/entry.ts": ENTRY });
  const result = await build({ root, logLevel: "silent", configFile: false, ...config(root) });
  const outputs = Array.isArray(result) ? result : [result];
  const first = outputs[0] as { output: readonly { type: string; code?: string }[] };
  return first.output.map((chunk) => (chunk.type === "chunk" ? (chunk.code ?? "") : "")).join("\n");
}

test("a browser bundle keeps only the client branch", async () => {
  const code = await bundled(() => ({
    build: {
      write: false,
      minify: true,
      lib: { entry: "src/entry.ts", formats: ["es"], fileName: "entry" },
    },
  }));

  expect(code).toContain("CLIENT_ONLY_BRANCH");
  expect(code).not.toContain("SERVER_ONLY_BRANCH");
});

test("a server bundle keeps only the server branch", async () => {
  const code = await bundled(() => ({
    ssr: { noExternal: true },
    build: { write: false, minify: true, ssr: "src/entry.ts" },
  }));

  expect(code).toContain("SERVER_ONLY_BRANCH");
  expect(code).not.toContain("CLIENT_ONLY_BRANCH");
});

test("a server bundle for a worker runtime is a server bundle too", async () => {
  const code = await bundled(() => ({
    plugins: [barq()],
    ssr: { noExternal: true, target: "webworker" },
    build: { write: false, minify: true, ssr: "src/entry.ts" },
  }));

  expect(code).toContain("SERVER_ONLY_BRANCH");
  expect(code).not.toContain("CLIENT_ONLY_BRANCH");
});
