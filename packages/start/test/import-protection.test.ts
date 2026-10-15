/**
 * A `.server.` file's code is in no browser chunk, and a `.client.` file's is
 * in no server one.
 *
 * Checked on what the bundler RENDERED rather than on what was imported: a
 * module that is imported and shaken out again has leaked nothing, and one
 * whose exports became `clientRpc` stubs is the client half it was meant to be.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";

import { type BarqStartOptions, barqStart } from "../src/vite.ts";

const FIXTURES = fileURLToPath(new URL("./protect-fixture", import.meta.url));
const built: string[] = [];

afterAll(() => {
  for (const out of built) rmSync(out, { recursive: true, force: true });
});

/** Build one fixture, answering the error the build failed with or `null`. */
const build = async (
  fixture: string,
  outputDirectory: string,
  options: BarqStartOptions = {},
): Promise<Error | null> => {
  const root = join(FIXTURES, fixture);
  built.push(join(root, outputDirectory));
  const builder = await createBuilder({
    root,
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
    plugins: barqStart({ pages: false, outputDirectory, ...options }),
  });
  return builder.buildApp().then(
    () => null,
    (error: unknown) => error as Error,
  );
};

const browserCode = (fixture: string, outputDirectory: string): string => {
  const assets = join(FIXTURES, fixture, outputDirectory, "client", "assets");
  return readdirSync(assets)
    .map((name) => readFileSync(join(assets, name), "utf8"))
    .join("\n");
};

describe("a `.server.` module", () => {
  test("whose code reaches a browser chunk fails the build, naming it and its importer", async () => {
    const error = await build("leak", "dist-refused");
    expect(error?.message).toContain("src/secret.server.ts");
    expect(error?.message).toContain("imported by src/main.ts");
  }, 60_000);

  test("used only inside `createServerOnlyFn` is emptied by the compiler, and is not a leak", async () => {
    expect(await build("clean", "dist")).toBeNull();
    expect(browserCode("clean", "dist")).not.toContain("SERVER_ONLY_MARKER");
  }, 60_000);

  test("that declares server functions is the client's to import, as stubs", async () => {
    expect(browserCode("clean", "dist")).toContain("users.server.ts#loadUsers");
  });

  test("`importProtection: false` ships it, which is the project's to choose", async () => {
    expect(await build("leak", "dist-allowed", { importProtection: false })).toBeNull();
    expect(browserCode("leak", "dist-allowed")).toContain("SERVER_ONLY_MARKER");
  }, 60_000);
});

describe("a `.client.` module", () => {
  test("whose code reaches the server bundle fails the build", async () => {
    const error = await build("server-leak", "dist");
    expect(error?.message).toContain("src/widget.client.ts");
    expect(error?.message).toContain("imported by src/data.ts");
  }, 60_000);
});
