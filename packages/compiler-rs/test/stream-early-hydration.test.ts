import { expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";
import { assembleHydrating } from "./stream.ts";

/**
 * A client that hydrates at shell time, which is what an `async` entry does on
 * a streamed page: the deferred boundary's fallback is claimed, and the
 * server's content arrives afterwards. The boundary must end up showing ONE
 * copy of the content, whichever of the two builds it.
 */
const NESTED = `
import { For, Loading, createMemo } from "@barqjs/core"
export default function LateRows() {
  const rows = createMemo(() => new Promise((r) => setTimeout(() => r(["salama", "example", "acme"]), 0)))
  return (
    <div>
      <p class="shell">shell</p>
      <Loading fallback={<i class="skel">skel</i>}>
        <ul>
          <For each={() => rows()}>{(row) => <li>{row}</li>}</For>
        </ul>
      </Loading>
    </div>
  )
}
`;

/** The read at the top of the boundary's content, as a route's body reads its loader. */
const TOP = `
import { Loading, createMemo } from "@barqjs/core"
function Rows(props) {
  const list = props.rows()
  return <ul>{list.map((row) => <li>{row}</li>)}</ul>
}
export default function LateRows() {
  const rows = createMemo(() => new Promise((r) => setTimeout(() => r(["salama", "example", "acme"]), 0)))
  return (
    <div>
      <p class="shell">shell</p>
      <Loading fallback={<i class="skel">skel</i>}>
        <Rows rows={rows} />
      </Loading>
    </div>
  )
}
`;

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function hydratedAtShell(source: string, name: string) {
  const compiled = await compileText(source, name, true, false);
  const core = await import("@barqjs/core");
  const container = host("");
  let dispose = (): void => {};
  const chunks = await assembleHydrating(compiled.ssr, container, 1, () => {
    core.resetChildIds();
    dispose = core.hydrate(compiled.dom.default as never, container);
  });
  const served = [...container.querySelectorAll("li")];
  for (let i = 0; i < 5; i++) {
    await tick();
    core.flush();
  }
  const result = {
    chunks: chunks.length,
    served,
    rows: [...container.querySelectorAll("li")],
    skeleton: container.querySelector(".skel"),
    recovered: core.hydrate.report.recovered,
  };
  dispose();
  container.remove();
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
  return result;
}

test("content read below the boundary is shown once, not beside the server's copy", async () => {
  const result = await hydratedAtShell(NESTED, "stream-early-nested");

  expect(result.chunks).toBeGreaterThan(2);
  expect(result.rows.map((li) => li.textContent)).toEqual(["salama", "example", "acme"]);
  expect(result.skeleton).toBeNull();
  expect(result.recovered).toBe(false);
});

test("content read at the top of the boundary claims the nodes the stream swapped in", async () => {
  const result = await hydratedAtShell(TOP, "stream-early-top");

  expect(result.served.map((li) => li.textContent)).toEqual(["salama", "example", "acme"]);
  expect(result.rows).toEqual(result.served);
  expect(result.skeleton).toBeNull();
  expect(result.recovered).toBe(false);
});
