import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// The types are invisible to every other test here. A positive that stops
// compiling and a `@ts-expect-error` that stops firing (TS2578) both fail tsc.
test("the JSX call-site types accept values and still refuse wrong props", () => {
  const result = spawnSync("bunx", ["tsc", "--noEmit", "--pretty", "false", "-p", HERE], {
    cwd: join(HERE, "..", ".."),
    encoding: "utf8",
  });
  expect(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()).toBe("");
  expect(result.status).toBe(0);
}, 60_000);
