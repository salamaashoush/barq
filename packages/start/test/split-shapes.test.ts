import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { barqStart } from "../src/vite.ts";

const ROOT = fileURLToPath(new URL("./split-shapes-fixture", import.meta.url));
const OUT = join(ROOT, "dist");

let client = "";
let server = "";
let failure = "";

beforeAll(async () => {
  rmSync(OUT, { recursive: true, force: true });
  try {
    const builder = await createBuilder({
      root: ROOT,
      configFile: false,
      logLevel: "silent",
      resolve: {
        alias: {
          "@barqjs/start/server": fileURLToPath(new URL("../src/server.ts", import.meta.url)),
          "@barqjs/start/client": fileURLToPath(new URL("../src/client.ts", import.meta.url)),
          "@barqjs/start/serve": fileURLToPath(new URL("../src/serve.ts", import.meta.url)),
          "@barqjs/start": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
        },
      },
      plugins: barqStart({ pages: false }),
    });
    await builder.buildApp();
  } catch (error) {
    // Refusing the build is one of the two acceptable answers; see `shipped`.
    failure = (error as Error).message;
    return;
  }
  const assets = join(OUT, "client", "assets");
  client = readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
  server = readFileSync(join(OUT, "server", "server.js"), "utf8");
}, 60_000);

afterAll(() => rmSync(OUT, { recursive: true, force: true }));

/**
 * Server code may stay out of the browser two ways: the client half is
 * synthesized, or the build refuses the module and says so. Shipping it with no
 * diagnostic is the third outcome, and the one these gate.
 */
const shipped = (marker: string): boolean => failure === "" && client.includes(marker);

describe("the client half of a server module", () => {
  test("the plain chain is synthesized", () => {
    expect(failure).toBe("");
    expect(shipped("plain-handler-body-must-not-ship")).toBe(false);
    expect(server).toContain("plain-handler-body-must-not-ship");
  });

  test.each([
    ["an `as` cast around the chain", "cast-handler-body-must-not-ship"],
    ["`satisfies` after the chain", "satisfies-handler-body-must-not-ship"],
    ["a namespace import of the builder", "namespace-handler-body-must-not-ship"],
    ["a builder held in a variable", "held-builder-handler-body-must-not-ship"],
  ])("%s does not put the handler body in the browser", (_shape, marker) => {
    expect(shipped(marker)).toBe(false);
  });

  test("createServerOnlyFn leaves the module its body imported out of the browser", () => {
    expect(shipped("db-module-must-not-ship")).toBe(false);
  });
});
