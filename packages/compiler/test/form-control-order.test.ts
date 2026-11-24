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
const [spreadProps, setSpreadProps] = createSignal<Record<string, unknown>>({
  "aria-label": "people",
  value: "grace",
});
export { setSpreadProps };
export function SpreadValued() {
  return <select {...spreadProps()}><For each={() => NAMES}>{(name) => <option value={name}>{name.toUpperCase()}</option>}</For></select>;
}
export function SpreadValuedStatic() {
  return <select {...{ value: "2" }}><option value="1">One</option><option value="2">Two</option></select>;
}
export function SpreadIndexed() {
  return <select {...{ selectedIndex: 2 }}><option value="ada">Ada</option><option value="grace">Grace</option><option value="edsger">Edsger</option></select>;
}
export function SpreadMultiple() {
  return <select {...{ multiple: true, "aria-label": "people" }}><For each={() => NAMES}>{(name) => <option value={name} selected={name !== "ada"}>{name}</option>}</For></select>;
}
export function SpreadMultipleStatic() {
  return <select {...{ multiple: true }}><option value="ada" selected>Ada</option><option value="grace" selected>Grace</option><option value="edsger">Edsger</option></select>;
}
export function SpreadBoth() {
  return <select {...{ multiple: true, value: "edsger" }}><For each={() => NAMES}>{(name) => <option value={name} selected={name === "ada"}>{name}</option>}</For></select>;
}
export function SpreadThenValue() {
  return <select {...spreadProps()} value="ada"><For each={() => NAMES}>{(name) => <option value={name}>{name}</option>}</For></select>;
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

async function mounted(
  name: string,
  options: Record<string, unknown> = {},
): Promise<{
  host: HTMLElement;
  dispose: () => void;
  flush: () => void;
  module: Record<string, unknown>;
}> {
  const core = await import("@barqjs/core");
  const web = await import("@barqjs/web");
  const module = (await loadModule(
    compileSource(SOURCE, "form-order.tsx", options),
    `form-order-${name}${options.interp === true ? "-interp" : ""}`,
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

function optionsAtWrite(property: "value" | "selectedIndex" | "multiple"): {
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

describe.each([
  ["the DOM backend", {}],
  ["the interpreter", { interp: true }],
] as const)("a spread on a <select>, compiled for %s", (_, options) => {
  test("<select {...props}> writes a value from the spread after its options", async () => {
    const writes = optionsAtWrite("value");
    const { host, dispose, flush, module } = await mounted("SpreadValued", options).finally(
      writes.restore,
    );
    expect(writes.counts).toEqual([4]);
    const select = host.querySelector("select")!;
    expect(select.value).toBe("grace");
    expect(select.getAttribute("aria-label")).toBe("people");
    const set = module.setSpreadProps as (next: Record<string, unknown>) => void;
    set({ "aria-label": "people", value: "edsger" });
    flush();
    expect(select.value).toBe("edsger");
    set({ "aria-label": "names", value: "edsger" });
    flush();
    expect(select.getAttribute("aria-label")).toBe("names");
    expect(select.value).toBe("edsger");
    set({ value: "edsger" });
    flush();
    expect(select.hasAttribute("aria-label")).toBe(false);
    expect(select.value).toBe("edsger");
    dispose();
  });

  test("<select {...props}> writes its value after the values of options in the template", async () => {
    const { host, dispose } = await mounted("SpreadValuedStatic", options);
    expect(host.querySelector("select")!.value).toBe("2");
    dispose();
  });

  test("<select {...props}> writes a selectedIndex from the spread after its options", async () => {
    const writes = optionsAtWrite("selectedIndex");
    const { host, dispose } = await mounted("SpreadIndexed", options).finally(writes.restore);
    expect(writes.counts).toEqual([3]);
    expect(host.querySelector("select")!.value).toBe("edsger");
    dispose();
  });

  test("<select {...props}> sets multiple before its options, so each selected one stays", async () => {
    const writes = optionsAtWrite("multiple");
    const { host, dispose } = await mounted("SpreadMultiple", options).finally(writes.restore);
    expect(writes.counts).toEqual([0]);
    const select = host.querySelector("select")!;
    expect(select.multiple).toBe(true);
    expect(select.getAttribute("aria-label")).toBe("people");
    expect([...select.selectedOptions].map((option) => option.value)).toEqual([
      "grace",
      "edsger",
      "barbara",
    ]);
    dispose();
  });

  test("<select {...props}> keeps every selected option written in the template", async () => {
    const { host, dispose } = await mounted("SpreadMultipleStatic", options);
    const select = host.querySelector("select")!;
    expect(select.multiple).toBe(true);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(["ada", "grace"]);
    dispose();
  });

  test("<select {...props}> with multiple and a value: multiple first, value last", async () => {
    const multiple = optionsAtWrite("multiple");
    const value = optionsAtWrite("value");
    const { host, dispose } = await mounted("SpreadBoth", options).finally(() => {
      value.restore();
      multiple.restore();
    });
    expect(multiple.counts).toEqual([0]);
    expect(value.counts).toEqual([4]);
    const select = host.querySelector("select")!;
    expect(select.multiple).toBe(true);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(["edsger"]);
    dispose();
  });

  test("a value written after a spread is the select's, whatever the spread holds", async () => {
    const { host, dispose, flush, module } = await mounted("SpreadThenValue", options);
    const select = host.querySelector("select")!;
    expect(select.value).toBe("ada");
    (module.setSpreadProps as (next: Record<string, unknown>) => void)({ value: "edsger" });
    flush();
    expect(select.value).toBe("ada");
    dispose();
  });
});
