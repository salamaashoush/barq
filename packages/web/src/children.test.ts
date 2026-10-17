/**
 * Solid 2.0's `children()`, against what the compiler actually hands a
 * component: a Block whose body yields nodes, strings, Cells and nested Blocks.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { flush, type JSXElement } from "@barqjs/core";
import { render } from "./index.ts";
import { compileModule } from "./test-compile.ts";

afterEach(() => {
  document.body.textContent = "";
});

const host = (): HTMLElement => {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
};

interface View {
  App: (props: object) => JSXElement;
  setCount: (count: number) => void;
  cleanups: string[];
  seen: unknown[][];
}

const SOURCE = `import { children, createSignal, onCleanup } from "@barqjs/core";
const [count, setCount] = createSignal(1);
export const cleanups: string[] = [];
export const seen: unknown[][] = [];
export { setCount };
function Leaf() {
  onCleanup(() => cleanups.push("leaf"));
  return <em>leaf</em>;
}
function List(props) {
  const items = children(() => props.children);
  return (
    <ul>
      {(() => {
        const all = items.toArray();
        seen.push(all);
        return all.map((item) => <li>{item}</li>);
      })()}
    </ul>
  );
}
export const App = () => (
  <List>
    <b>salama</b>
    <Leaf />
    {count() > 1 ? <u>more</u> : null}
  </List>
);`;

describe("children()", () => {
  test("resolves a component's children so it can iterate them", async () => {
    const view = await compileModule<View>(SOURCE, "children-iterate");
    const element = host();
    const dispose = render(() => view.App({}), element);
    flush();
    const items = [...element.querySelectorAll("li")];
    expect(items.map((li) => li.innerHTML)).toEqual(["<b>salama</b>", "<em>leaf</em>", ""]);
    expect(view.seen.at(-1)?.[2]).toBeNull();
    dispose();
  });

  test("a reactive child is re-resolved when what it reads changes", async () => {
    const view = await compileModule<View>(SOURCE, "children-reactive");
    const element = host();
    const dispose = render(() => view.App({}), element);
    flush();
    expect(element.querySelectorAll("u")).toHaveLength(0);
    view.setCount(2);
    flush();
    expect([...element.querySelectorAll("u")].map((u) => u.textContent)).toEqual(["more"]);
    const resolved = view.seen.at(-1) ?? [];
    expect(resolved).toHaveLength(3);
    expect((resolved[2] as Element).tagName).toBe("U");
    dispose();
  });

  test("what the children built is owned by the component, and disposed with it", async () => {
    const view = await compileModule<View>(SOURCE, "children-owned");
    const element = host();
    const dispose = render(() => view.App({}), element);
    flush();
    expect(view.cleanups).toEqual([]);
    dispose();
    expect(view.cleanups).toEqual(["leaf"]);
  });

  test("a render callback among the children is returned untouched", async () => {
    const view = await compileModule<{ App: (props: object) => JSXElement; got: unknown[] }>(
      `import { children } from "@barqjs/core";
       export const got: unknown[] = [];
       function Probe(props) {
         const items = children(() => props.children);
         got.push(...items.toArray());
         return null;
       }
       export const App = () => <Probe>{(name: string) => <i>{name}</i>}</Probe>;`,
      "children-callback",
    );
    const dispose = render(() => view.App({}), host());
    flush();
    expect(view.got).toHaveLength(1);
    expect(typeof view.got[0]).toBe("function");
    expect((view.got[0] as { length: number }).length).toBe(1);
    dispose();
  });
});
