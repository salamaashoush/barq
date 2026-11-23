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
const NAMES = ["ada", "grace", "edsger", "barbara"];
const [label, setLabel] = createSignal("people");
export const pick = createSignal(1);
export { setLabel };
export function Labelled() {
  return <select aria-label={label()} value={choice[0]()}><For each={() => NAMES}>{(name) => <option value={name}>{name}</option>}</For></select>;
}
export function Indexed() {
  return <select aria-label={label()} selectedIndex={pick[0]()}><For each={() => NAMES}>{(name) => <option value={name}>{name}</option>}</For></select>;
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

async function mounted(name: string): Promise<{
  host: HTMLElement;
  dispose: () => void;
  flush: () => void;
  module: Record<string, unknown>;
}> {
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
    module,
    flush: core.flush,
    dispose: () => {
      dispose();
      host.remove();
    },
  };
}

function optionsAtWrite(property: "value" | "selectedIndex"): {
  counts: number[];
  restore: () => void;
} {
  const prototype = HTMLSelectElement.prototype;
  const own = Object.getOwnPropertyDescriptor(prototype, property)!;
  const counts: number[] = [];
  Object.defineProperty(prototype, property, {
    ...own,
    set(this: HTMLSelectElement, next: unknown) {
      counts.push(this.options.length);
      own.set!.call(this, next);
    },
  });
  return { counts, restore: () => Object.defineProperty(prototype, property, own) };
}

describe("a form write that reads what is written beside it", () => {
  test("<select value> over <For> options selects the option the value names", async () => {
    const { host, dispose } = await mounted("Valued");
    expect(host.querySelector("select")?.value).toBe("grace");
    dispose();
  });

  test("<select value> beside another bound attribute still waits for its options", async () => {
    const writes = optionsAtWrite("value");
    const { host, dispose, flush, module } = await mounted("Labelled").finally(writes.restore);
    expect(writes.counts).toEqual([4]);
    const select = host.querySelector("select")!;
    expect(select.value).toBe("grace");
    const [, setChoice] = module.choice as [() => string, (next: string) => void];
    setChoice("edsger");
    flush();
    expect(select.value).toBe("edsger");
    (module.setLabel as (next: string) => void)("names");
    flush();
    expect(select.getAttribute("aria-label")).toBe("names");
    expect(select.value).toBe("edsger");
    dispose();
  });

  test("<select selectedIndex> is the property, written after its options", async () => {
    const writes = optionsAtWrite("selectedIndex");
    const { host, dispose, flush, module } = await mounted("Indexed").finally(writes.restore);
    expect(writes.counts).toEqual([4]);
    const select = host.querySelector("select")!;
    expect(select.value).toBe("grace");
    expect(select.hasAttribute("selectedIndex")).toBe(false);
    const [, setPick] = module.pick as [() => number, (next: number) => void];
    setPick(2);
    flush();
    expect(select.value).toBe("edsger");
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
