import { describe, expect, test } from "bun:test";

import type { FixtureModule } from "./harness.ts";
import { census, compileText, host, reuse, shape, wire } from "./hydration.ts";

/**
 * A list row is an owner of its own on both backends.
 *
 * The client's `each` builds every row under the owner `mapArray` opens for
 * it, so what a row binds on its owner stays in the row: a context it sets,
 * an error boundary it installs, a cleanup it registers. The server has to
 * open the same owner per row, or the string backend renders a row against
 * what the row before it left behind, writes markup the client does not
 * build, and hydration has to throw it away.
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
  const name = props.name()
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
import { For, getOwner } from "@barqjs/core"
export const owners = []
export default function Page() {
  return (
    <ul>
      <For each={["salama", "example", "acme"]}>
        {(name) => {
          owners.push(getOwner())
          return <li>{name}</li>
        }}
      </For>
    </ul>
  )
}
`;

describe("a list row is an owner of its own on the server", () => {
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

  test("each row is built under an owner no other row shares", async () => {
    const compiled = await compileText(ROW_OWNERS, "row-owners", true, false);
    wire(compiled.ssr);
    const served = (compiled.ssr as FixtureModule & Record<string, unknown>).owners as unknown[];

    expect(served).toHaveLength(3);
    expect(new Set(served).size).toBe(3);
  });
});
