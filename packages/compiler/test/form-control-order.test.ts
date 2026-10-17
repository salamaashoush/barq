import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";

/**
 * Two form writes read something written beside them: a `<select>`'s value
 * names one of its options, and `bind:group` compares the field's own `value`.
 * Emitted in source order, each ran before the thing it reads existed.
 */
const SOURCE = `
import { For, createSignal } from "@barqjs/core";
export const choice = createSignal("grace");
const [names] = createSignal(["ada", "grace", "edsger"]);
export function Valued() {
  return <select value={choice[0]()}><For each={names()}>{(name) => <option value={name}>{name}</option>}</For></select>;
}
export function Bound() {
  return <select bind:value={choice}><For each={names()}>{(name) => <option value={name}>{name}</option>}</For></select>;
}
export function Radios() {
  return (
    <form>
      <input type="radio" name="person" bind:group={choice} value="ada" />
      <input type="radio" name="person" bind:group={choice} value="grace" />
    </form>
  );
}
`;

async function mounted(name: string): Promise<{ host: HTMLElement; dispose: () => void }> {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "form-order.tsx"),
    `form-order-${name}`,
  )) as unknown as Record<string, () => unknown>;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = web.render(() => module[name]() as never, host);
  return {
    host,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

describe("a form write that reads what is written beside it", () => {
  test("<select value> over <For> options selects the option the value names", async () => {
    const { host, dispose } = await mounted("Valued");
    expect(host.querySelector("select")?.value).toBe("grace");
    dispose();
  });

  test("<select bind:value> over <For> options selects the option the signal names", async () => {
    const { host, dispose } = await mounted("Bound");
    expect(host.querySelector("select")?.value).toBe("grace");
    dispose();
  });

  test("bind:group written before value checks the radio the signal names", async () => {
    const { host, dispose } = await mounted("Radios");
    const checked = [...host.querySelectorAll("input")].map((radio) => radio.checked);
    expect(checked).toEqual([false, true]);
    dispose();
  });
});
