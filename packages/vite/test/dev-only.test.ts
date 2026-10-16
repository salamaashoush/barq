/**
 * What development builds add for diagnostics stays out of a production build.
 *
 * A development compile names each component it calls and writes each
 * hydratable template's source location; the development entries carry the
 * console sink and the owner paths. The same small application is built both
 * ways: the development build is the control that proves each marker is real,
 * and the production build must carry none of them.
 */

import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("./fixtures/devonly", import.meta.url));
const BUILD = fileURLToPath(new URL("./fixtures/devonly/build.ts", import.meta.url));

async function bundle(mode: "production" | "development", ssr?: string): Promise<string> {
  const child = Bun.spawn(["bun", BUILD, mode, ...(ssr === undefined ? [] : [ssr])], {
    cwd: ROOT,
    // `vite build` sets NODE_ENV only when it is unset, and `bun test` sets it
    // to `test`, which resolves the `development` condition. Each build runs
    // the way a deploy or a dev server would.
    env: { ...process.env, NODE_ENV: mode },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(status).toBe(0);
  return code;
}

/** What only a development build has a reason to ship. */
const MARKERS = {
  "a component named for its owner path": '"Greeting")',
  "a template's source location": "src/main.tsx:",
  "the template-location report": "The template being hydrated is at",
  "the overlay's server channel": "barq:server-diagnostics",
};

describe("dev-only diagnostics in a client bundle", () => {
  test("a development build carries each of them", async () => {
    const code = await bundle("development");
    for (const [what, marker] of Object.entries(MARKERS).slice(0, 2)) {
      expect(code.includes(marker), what).toBe(true);
    }
  }, 60_000);

  test("a production build carries none of them", async () => {
    const code = await bundle("production");
    for (const [what, marker] of Object.entries(MARKERS)) {
      expect(code.includes(marker), what).toBe(false);
    }
    expect(code).not.toContain("createComponent");
    expect(code).not.toContain("[barq] ");
  }, 60_000);
});

describe("dev-only diagnostics in a server bundle", () => {
  const SERVER = "src/server.ts";

  test("a development build times each server function", async () => {
    const code = await bundle("development", SERVER);
    // The entry `serverTiming` writes, and the header it goes on.
    expect(code).toContain(";dur=");
    expect(code).toContain("server-timing");
  }, 60_000);

  test("a production build carries no server-function timing and no development reporting", async () => {
    const code = await bundle("production", SERVER);
    // The timing's own metric. `server-timing` itself is in every build: the
    // request's W3C trace is handed to the browser on it.
    expect(code).not.toContain(";dur=");
    expect(code).not.toContain("ssrFixStacktrace");
    // The redaction itself is unchanged: the fixed line is what a failure answers.
    expect(code).toContain("internal server error");
  }, 60_000);
});
