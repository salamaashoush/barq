/**
 * The package's entry point is a hand-written loader rather than the one
 * `napi build` generates, so nothing regenerates its export list when the
 * binding grows a function. These hold it to the binding, to the declarations
 * and to node's CommonJS-to-ESM bridge, and pin the two errors a person sees
 * when no binary matches their machine.
 */
import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PACKAGE = resolve(import.meta.dir, "..");
const require_ = createRequire(import.meta.url);

const loader = require_("../index.js") as Record<string, unknown>;
const binary = readdirSync(PACKAGE).find((file) => /^barq-compiler\..+\.node$/.test(file));

function node(args: string[], cwd = PACKAGE): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({ cmd: ["node", ...args], cwd, stdout: "pipe", stderr: "pipe" });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** `index.js` and `package.json` alone, so neither a local build nor a platform package is in reach. */
function isolatedCopy(): string {
  const directory = mkdtempSync(join(tmpdir(), "barq-loader-"));
  copyFileSync(join(PACKAGE, "index.js"), join(directory, "index.js"));
  copyFileSync(join(PACKAGE, "package.json"), join(directory, "package.json"));
  return directory;
}

describe("the loader", () => {
  test("exports exactly what the native binding exports", () => {
    expect(binary, "no local build to compare against: run `bun run build`").toBeDefined();
    const native = require_(join(PACKAGE, binary as string)) as Record<string, unknown>;
    expect(Object.keys(loader).toSorted()).toEqual(Object.keys(native).toSorted());
  });

  test("exports every function the declarations name", () => {
    const declared = [
      ...readFileSync(join(PACKAGE, "index.d.ts"), "utf8").matchAll(
        /^export declare function (\w+)/gm,
      ),
    ].map((match) => match[1]);
    expect(declared.toSorted()).toEqual(Object.keys(loader).toSorted());
  });

  test("its exports are named imports under node's ESM loader", () => {
    const names = Object.keys(loader).join(", ");
    const result = node([
      "--input-type=module",
      "-e",
      `import { ${names} } from ${JSON.stringify(join(PACKAGE, "index.js"))};` +
        `console.log([${names}].every((f) => typeof f === "function"));`,
    ]);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim()).toBe("true");
  });

  test("names the platform and the prebuilt ones when none matches", () => {
    const directory = isolatedCopy();
    try {
      const result = node(
        [
          "-e",
          'Object.defineProperty(process, "platform", { value: "aix" });' +
            'Object.defineProperty(process, "arch", { value: "ppc64" });' +
            'require("./index.js");',
        ],
        directory,
      );
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("no prebuilt native binding for aix-ppc64");
      expect(result.stderr).toContain("linux-x64-musl");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("names the platform package it expected when that is not installed", () => {
    const directory = isolatedCopy();
    try {
      const result = node(["-e", 'require("./index.js");'], directory);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toMatch(
        /the optional dependency @barqjs\/compiler-rs-[\w-]+ is not installed/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
