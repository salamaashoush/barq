import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * A `{count()}` hole that sits at the root of a unit rather than inside an
 * element. The same expression one level down, `<p>{count()}</p>`, is a live
 * hole and follows the signal.
 */
const SOURCE = `
import { For, Show, createSignal } from "@barqjs/core";
export const [count, setCount] = createSignal(0);
export const [open] = createSignal(true);
export const [rows] = createSignal(["ada"]);
export function SoleChildOfShow() { return <Show when={open()}>{count()}</Show>; }
export function BesideTextInShow() { return <Show when={open()}>count: {count()}</Show>; }
export function BesideAnElementInShow() { return <Show when={open()}>{count()}<i /></Show>; }
export function InAFragment() { return <>{count()}<i /></>; }
export function InARow() { return <ul><For each={rows()}>{(row) => <>{row}: {count()}</>}</For></ul>; }
`;

async function textAfterIncrement(name: string): Promise<[string, string]> {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "unit-root.tsx"),
    `unit-root-${name}`,
  )) as unknown as Record<string, () => unknown> & { setCount(next: number): void };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
  try {
    const before = host.textContent ?? "";
    module.setCount(1);
    core.flush();
    return [before, host.textContent ?? ""];
  } finally {
    dispose();
    host.remove();
  }
}

describe("an expression hole at the root of a unit updates like one inside an element", () => {
  test("the sole child of <Show>", async () => {
    expect(await textAfterIncrement("SoleChildOfShow")).toEqual(["0", "1"]);
  });

  test("beside text in <Show>", async () => {
    expect(await textAfterIncrement("BesideTextInShow")).toEqual(["count: 0", "count: 1"]);
  });

  test("beside an element in <Show>", async () => {
    expect(await textAfterIncrement("BesideAnElementInShow")).toEqual(["0", "1"]);
  });

  test("in a fragment a component returns", async () => {
    expect(await textAfterIncrement("InAFragment")).toEqual(["0", "1"]);
  });

  test("in a fragment a <For> row returns", async () => {
    expect(await textAfterIncrement("InARow")).toEqual(["ada: 0", "ada: 1"]);
  });
});
