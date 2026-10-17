import { describe, expect, test } from "bun:test";

import { compileSource, loadModule } from "./harness.ts";
import { census, compileText, host, reuse, shape, wire } from "./hydration.ts";

/**
 * A component's children are an array, and each part of it that moves is a
 * hole of its own.
 *
 * As ONE hole, a change to any signal a child read would re-run the whole of
 * it, so `{count()}` beside `<Field />` would build a second field on every
 * count: the input the user was typing into replaced by a new one.
 */
describe("a child that moves leaves its siblings alone", () => {
  const SOURCE = `
    import { createSignal } from "@barqjs/core";
    export const [shown] = createSignal(true);
    export const [count, setCount] = createSignal(0);
    export let built = 0;
    function Field() { built++; return <input class="field" />; }
    function Group(props) { return <div class="group">{props.children}</div>; }
    export default function Page() {
      return <main><Group>{shown() ? <Field /> : null}{count()}<Field /></Group></main>;
    }
  `;

  test("a text hole that changes builds nothing and keeps every node beside it", async () => {
    const core = await import("@barqjs/core");
    const module = (await loadModule(
      compileSource(SOURCE, "children-order.tsx"),
      "children-order-siblings",
    )) as unknown as { default: () => unknown; setCount(next: number): void; built: number };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const dispose = core.render(() => module.default() as never, container);
    try {
      const fields = [...container.querySelectorAll("input")];
      const built = module.built;
      module.setCount(1);
      core.flush();
      expect(container.querySelector(".group")?.textContent).toBe("1");
      expect(module.built).toBe(built);
      expect([...container.querySelectorAll("input")]).toEqual(fields);
    } finally {
      dispose();
      container.remove();
    }
  });
});

/**
 * The parts of a children array are built in the order they are written.
 *
 * An array is evaluated before anything calls a thunk in it, so a construction
 * left bare beside one was built first. A hydrating page claims in document
 * order: `<Content />` took the node the optional label before it was written
 * for, and the label then found the markup had run out.
 */
describe("children hydrate in the order they are written", () => {
  const SOURCE = `
    import { For } from "@barqjs/core";
    function Group(props) { return <div class="group">{props.children}</div>; }
    function Label(props) { return <div class="label">{props.children}</div>; }
    function Content(props) { return <div class="content">{props.children}</div>; }
    function Menu(props) { return <ul>{props.children}</ul>; }
    function Item(props) { return <li>{props.children}</li>; }
    const ITEMS = [{ name: "a" }, { name: "b" }];
    function Nav(props) {
      return (
        <Group>
          {props.label?.() === undefined ? null : <Label>{props.label()}</Label>}
          <Content>
            <Menu>
              <For each={() => props.items()}>
                {(entry) => (<Item><span>{entry.name}</span></Item>)}
              </For>
            </Menu>
          </Content>
        </Group>
      );
    }
    export default function Page() {
      return <main><Nav items={ITEMS} /><Nav label="Docs" items={ITEMS} /></main>;
    }
  `;

  test("an optional child before a component leaves the component its own node", async () => {
    const compiled = await compileText(SOURCE, "children-order-hydration", true);
    const core = await import("@barqjs/core");
    const container = host(wire(compiled.ssr));
    const before = census(container);
    const served = shape(container);
    const dispose = core.hydrate(compiled.dom.default as never, container);
    const report = core.hydrate.report;
    const hydrated = shape(container);
    const claim = reuse(before, container);
    dispose();
    container.remove();

    expect({ recovered: report.recovered, mismatches: report.mismatches }).toEqual({
      recovered: false,
      mismatches: [],
    });
    expect(hydrated).toBe(served);
    expect(claim.percent).toBe(100);
  });
});
