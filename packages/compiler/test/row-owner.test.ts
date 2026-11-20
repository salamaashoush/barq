import { describe, expect, test } from "bun:test";

import type { FixtureModule } from "./harness.ts";
import { census, compileText, host, reuse, shape, wire } from "./hydration.ts";

/**
 * What a list row binds on its owner stays in the row, on both backends.
 *
 * The client's `each` builds every row under the owner `mapArray` opens for
 * it, so a context a row sets and an error boundary it installs stay in the
 * row. The server has to keep the same promise, or the string backend renders
 * a row against what the row before it left behind, writes markup the client
 * does not build, and hydration has to throw it away. It keeps it by never
 * building a row under an owner an earlier row wrote a binding on: rows that
 * write none share one, and none of them is the list's own.
 */

interface Rendered {
  served: string;
  hydrated: string;
  cold: string;
  recovered: boolean;
  mismatches: readonly string[];
  percent: number;
}

async function roundTrip(source: string, tag: string, dev: boolean): Promise<Rendered> {
  const compiled = await compileText(source, `${tag}-${dev ? "dev" : "prod"}`, true, dev);
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const container = host(wire(compiled.ssr));
  const served = shape(container);
  const before = census(container);
  core.resetChildIds();
  const dispose = web.hydrate(compiled.dom.default as never, container);
  const report = web.hydrate.report;
  const hydrated = shape(container);
  const kept = reuse(before, container);
  dispose();
  container.remove();

  const cold = host("");
  core.resetChildIds();
  const rendered = web.render(compiled.dom.default as never, cold);
  const coldShape = shape(cold);
  rendered();
  cold.remove();

  return {
    served,
    hydrated,
    cold: coldShape,
    recovered: report.recovered,
    mismatches: report.mismatches.map((mismatch) => mismatch.kind),
    percent: kept.percent,
  };
}

const ROW_CONTEXT = `
import { For, createContext, setContext, useContext } from "@barqjs/core"
const Row = createContext("none")
function Seen() { return <i>{useContext(Row)}</i> }
export default function Page() {
  return (
    <ul>
      <Seen />
      <For each={["salama", "example"]}>
        {(name) => {
          const inherited = useContext(Row)
          setContext(Row, name)
          return <li>{inherited}<Seen /></li>
        }}
      </For>
      <Seen />
    </ul>
  )
}
`;

const ROW_ERRORED = `
import { Errored, For, markSafeError } from "@barqjs/core"
function Cell(props) {
  const name = props.name
  if (name === "broken") throw markSafeError(new Error("row " + name))
  return <b>{name}</b>
}
export default function Page() {
  return (
    <ul>
      <For each={["salama", "broken", "example"]}>
        {(name) => (
          <li>
            <Errored fallback={(error) => <em>{error().message}</em>}>
              <Cell name={() => name} />
            </Errored>
          </li>
        )}
      </For>
    </ul>
  )
}
`;

const ROW_OWNERS = `
import { For, createContext, getOwner, setContext } from "@barqjs/core"
const Row = createContext("none")
export const owners = []
export const outer = []
export default function Page() {
  outer.push(getOwner())
  return (
    <ul>
      <For each={["salama", "example", "acme", "umbrella"]}>
        {(name) => {
          owners.push(getOwner())
          if (name === "example") setContext(Row, name)
          return <li>{name}</li>
        }}
      </For>
    </ul>
  )
}
`;

describe("what a list row binds stays in the row on the server", () => {
  for (const dev of [false, true]) {
    const build = dev ? "development" : "production";

    test(`a context a row sets stays in that row, and hydrates (${build})`, async () => {
      const result = await roundTrip(ROW_CONTEXT, "row-context", dev);

      expect(result.served).toBe(
        "<ul><i>none</i><li>none<i>salama</i></li><li>none<i>example</i></li><i>none</i></ul>",
      );
      expect(result.cold).toBe(result.served);
      expect(result.hydrated).toBe(result.served);
      expect({ recovered: result.recovered, mismatches: result.mismatches }).toEqual({
        recovered: false,
        mismatches: [],
      });
      expect(result.percent).toBe(100);
    });

    test(`an error boundary in a row catches that row alone, and hydrates (${build})`, async () => {
      const result = await roundTrip(ROW_ERRORED, "row-errored", dev);

      expect(result.served).toBe(
        "<ul><li><b>salama</b></li><li><em>row broken</em></li><li><b>example</b></li></ul>",
      );
      expect(result.cold).toBe(result.served);
      expect(result.hydrated).toBe(result.served);
      expect({ recovered: result.recovered, mismatches: result.mismatches }).toEqual({
        recovered: false,
        mismatches: [],
      });
      expect(result.percent).toBe(100);
    });
  }

  test("no row is built under an owner an earlier row wrote a binding on", async () => {
    const compiled = await compileText(ROW_OWNERS, "row-owners", true, false);
    wire(compiled.ssr);
    const module = compiled.ssr as FixtureModule & Record<string, unknown>;
    const served = module.owners as unknown[];
    const [page] = module.outer as unknown[];

    expect(served).toHaveLength(4);
    const [first, writer, after, last] = served;
    // Rows that write nothing share an owner, and it is not the list's.
    expect(first).toBe(writer);
    expect(after).toBe(last);
    for (const owner of served) expect(owner).not.toBe(page);
    // The row that set a context is the last one built under its owner.
    expect(after).not.toBe(writer);
  });
});
