/**
 * A page that only renders must not ship hydration.
 *
 * `hydrate.report` used to be assigned at module scope, a side effect that
 * kept `hydrate` and its whole closure in every bundle; and `insert`,
 * `template`, the regions and every render effect reached the claim walk
 * through direct calls, so a `render`-only page shipped all of it behind
 * branches that never run. The walk is now installed by `hydrate` itself.
 * This bundles the same entry both ways and reads the output back for the
 * walk's own names.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "bun:test";

const root = fileURLToPath(new URL("./index.ts", import.meta.url));
const workspace = mkdtempSync(join(tmpdir(), "barq-core-treeshake-"));

afterAll(() => rmSync(workspace, { recursive: true, force: true }));

let probes = 0;

async function bundle(source: string): Promise<string> {
  const entry = join(workspace, `probe${probes++}.ts`);
  writeFileSync(entry, source.replaceAll("<root>", root));
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: false,
    conditions: ["browser"],
  });
  if (!result.success) throw new AggregateError(result.logs, "the probe did not build");
  return await result.outputs[0].text();
}

const WALK = [
  "function hydrateContainer(",
  "function beginHydration(",
  "function claimRangeWalk(",
  "function claimNodeWalk(",
  "function withRangeTakenWalk(",
  "function verifySubtree(",
  "function placeClaimed(",
  "function detectTextDrift(",
  "function claimEffect(",
];

const PAGE = `
  import { createSignal, delegateEvents, insert, render, template } from "<root>";
  const tmpl = template("<button type=button>Hello, clicked <!> times</button>");
  function App() {
    const [count, setCount] = createSignal(0);
    const el = tmpl();
    el.__bq_click = () => setCount((c) => c + 1);
    insert(el, count, el.lastChild);
    return el;
  }
  delegateEvents(["click"]);
`;

describe("tree shaking", () => {
  test("a render-only page ships none of the claim walk", async () => {
    const out = await bundle(`${PAGE}
      render(() => App(), document.body);
    `);
    expect(out).toContain("function insert(");
    for (const name of WALK) {
      expect(out, `${name} survived into a bundle that never hydrates`).not.toContain(name);
    }
  });

  test("a page that hydrates ships all of it", async () => {
    const out = await bundle(`${PAGE}
      import { hydrate } from "<root>";
      hydrate(() => App(), document.body);
    `);
    for (const name of WALK) expect(out).toContain(name);
  });
});
