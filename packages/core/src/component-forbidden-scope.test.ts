/**
 * A component called where the engine forbids reactive primitives.
 *
 * `onSettled` and a tracked effect's callback run under an owner nothing may be
 * created under. Development's engine says so the moment anything is, and a
 * component's frame is something, so the call throws there. The production
 * engine checks nothing, for any primitive, and a frame is no exception: it
 * links where it was made and is disposed with that owner.
 *
 * Each runs in a process of its own, because which engine a module gets is
 * decided by the conditions it was resolved under.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

const INDEX = fileURLToPath(new URL("./index.ts", import.meta.url));

const SCRIPT = `
  import { createComponent, createRoot, flush, onCleanup, onSettled } from ${JSON.stringify(INDEX)};
  const seen = [];
  const dispose = createRoot((release) => {
    onSettled(() => {
      try {
        seen.push(createComponent(() => {
          onCleanup(() => seen.push("cleaned"));
          return "salama";
        }, {}));
      } catch (error) {
        seen.push(String(error).includes("PRIMITIVE_IN_FORBIDDEN_SCOPE") ? "refused" : String(error));
      }
    });
    return release;
  });
  flush();
  dispose();
  process.stdout.write(JSON.stringify(seen));
`;

async function run(conditions: string[]): Promise<unknown> {
  const child = Bun.spawn(
    ["bun", ...conditions.map((condition) => `--conditions=${condition}`), "-e", SCRIPT],
    {
      cwd: join(INDEX, ".."),
      env: { ...process.env, NODE_ENV: conditions.length === 0 ? "production" : "development" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, status] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  expect(status).toBe(0);
  return JSON.parse(out);
}

describe("a component called from onSettled", () => {
  test("is refused by the development engine", async () => {
    expect(await run(["development"])).toEqual(["refused"]);
  });

  test("renders on the production engine and goes with the owner it was called under", async () => {
    expect(await run([])).toEqual(["salama", "cleaned"]);
  });
});
