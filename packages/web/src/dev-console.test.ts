/**
 * The development console sink.
 *
 * A diagnostic nothing subscribes to is dropped before it is built, so an
 * application sees one only through a subscriber. Three claims, each checked
 * where it can fail: the sink prints each distinct diagnostic once, the
 * `development` condition is what installs it, and nothing the production
 * entries load contains it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { installDevConsole } from "../../core/src/dev-console.ts";
import { bindValue, render } from "./index.ts";
import { createRoot } from "@barqjs/core";
import { diagnosticsEnabled } from "@barqjs/core/internal";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = join(HERE, "..");
const DIST = join(PACKAGE, "dist");

/** An already-built subtree, which the root cannot own: `RENDER_SUBTREE_NOT_OWNED`. */
function mountBuilt(): void {
  render(document.createElement("span"), document.createElement("div"))();
}

describe("the development console sink", () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  test("a warning is printed once however often it is raised", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      uninstall = installDevConsole();
      mountBuilt();
      mountBuilt();
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toStartWith("[barq] RENDER_SUBTREE_NOT_OWNED: ");
    } finally {
      warn.mockRestore();
    }
  });

  test("an error goes to console.error with its code and message", () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      uninstall = installDevConsole();
      createRoot((dispose) => {
        bindValue(document.createElement("input"), "value", "input", () => "salama");
        dispose();
      });
      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0]?.[0])).toBe(
        "[barq] BIND_TARGET_NOT_WRITABLE: `bind:value` on `<input>` was given a value of type " +
          "`function` instead of a signal, so the element does not follow the value and what " +
          "the user types is never written back. Pass the whole signal, the `[read, write]` " +
          'pair `createSignal` returns: `const text = createSignal("")` and then ' +
          "`bind:value={text}`.\n" +
          "  docs: https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/BIND_TARGET_NOT_WRITABLE.md",
      );
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  test("uninstalling stops the printing and leaves the channel off", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const stop = installDevConsole();
      expect(diagnosticsEnabled()).toBe(true);
      stop();
      expect(diagnosticsEnabled()).toBe(false);
      mountBuilt();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

/**
 * Resolve `@barqjs/core` the way an application does and report what came back:
 * `isDev`, and what reached the console for a diagnostic raised twice.
 */
const PROBE = `
  import { GlobalRegistrator } from "@happy-dom/global-registrator";
  GlobalRegistrator.register();
  const lines = [];
  console.warn = (...parts) => lines.push(parts.join(" "));
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  for (let i = 0; i < 2; i++) {
    web.render(document.createElement("span"), document.createElement("div"))();
  }
  process.stdout.write(JSON.stringify({ isDev: core.isDev, lines }));
`;

async function resolveAs(conditions: string[]): Promise<{ isDev: boolean; lines: string[] }> {
  const spawned = Bun.spawn(["bun", ...conditions, "-e", PROBE], {
    cwd: PACKAGE,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]);
  expect(stderr).toBe("");
  expect(code).toBe(0);
  return JSON.parse(stdout) as { isDev: boolean; lines: string[] };
}

describe("the entry a condition resolves to", () => {
  test("`development` installs the sink and reports isDev", async () => {
    const { isDev, lines } = await resolveAs(["--conditions=development"]);
    expect(isDev).toBe(true);
    expect(lines.length).toBe(1);
    expect(lines[0]).toStartWith("[barq] RENDER_SUBTREE_NOT_OWNED: ");
  });

  test("the default entry is silent and reports no isDev", async () => {
    const { isDev, lines } = await resolveAs([]);
    expect(isDev).toBe(false);
    expect(lines).toEqual([]);
  });
});

/** Every file an entry loads, following its relative imports. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [join(DIST, entry)];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)) {
      pending.push(join(dirname(file), match[1]));
    }
  }
  return [...seen];
}

const MARKER = "[barq] ";
const built = ["index.js", "dev.js", "internal.js", "interp.js", "jsx-runtime.js"].every((entry) =>
  existsSync(join(DIST, entry)),
);

describe.if(built)("the built entries", () => {
  test("no production entry loads a byte of the sink", () => {
    for (const entry of ["index.js", "internal.js", "interp.js", "jsx-runtime.js"]) {
      for (const file of closure(entry)) {
        expect(readFileSync(file, "utf8").includes(MARKER), `${entry} loads ${file}`).toBe(false);
      }
    }
  });

  test("the development entry carries it", () => {
    const carried = closure("dev.js").some((file) => readFileSync(file, "utf8").includes(MARKER));
    expect(carried).toBe(true);
  });
});
