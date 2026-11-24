import { describe, expect, test } from "bun:test";

import { compileSource, loadModule, type FixtureModule } from "./harness.ts";
import { census, host, reuse, shape, wire } from "./hydration.ts";

type Build = "production" | "development";
const BUILDS: readonly Build[] = ["production", "development"];

interface Page extends FixtureModule {
  set(next: unknown): void;
}

let serial = 0;

async function compile(source: string, server: Build, client: Build): Promise<[Page, Page]> {
  const tag = `empty-child-${serial++}`;
  const dom = compileSource(source, `${tag}.tsx`, {
    hydratable: true,
    dev: client === "development",
  });
  const ssr = compileSource(source, `${tag}.tsx`, {
    ssr: true,
    hydratable: true,
    dev: server === "development",
  });
  return [
    (await loadModule(ssr, `${tag}-ssr`)) as Page,
    (await loadModule(dom, `${tag}-dom`)) as Page,
  ];
}

interface Case {
  source: string;
  served: string;
  /** Each value `set` is given in turn after hydration, and the markup it leaves. */
  steps: [unknown, string][];
}

const CASES: Record<string, Case> = {
  "a <For> row component that returns null": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["a", "", "b"]);
      export const set = setX;
      function Row(props) {
        if (props.n === "") return null;
        return <li>{props.n}</li>;
      }
      export default function Page() {
        return <ul><For each={x()}>{(n) => <Row n={n} />}</For></ul>;
      }`,
    served: "<ul><li>a</li><li>b</li></ul>",
    steps: [[["a", "c", "", "b"], "<ul><li>a</li><li>c</li><li>b</li></ul>"]],
  },
  "a <For> row component that returns null, between siblings": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["", "a", ""]);
      export const set = setX;
      function Row(props) {
        if (props.n === "") return null;
        return <li>{props.n}</li>;
      }
      export default function Page() {
        return <ul><li>first</li><For each={x()}>{(n) => <Row n={n} />}</For><li>last</li></ul>;
      }`,
    served: "<ul><li>first</li><li>a</li><li>last</li></ul>",
    steps: [[["b", "", "a"], "<ul><li>first</li><li>b</li><li>a</li><li>last</li></ul>"]],
  },
  "a <For> whose last row component returns null": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["a", ""]);
      export const set = setX;
      function Row(props) {
        if (props.n === "") return null;
        return <li>{props.n}</li>;
      }
      export default function Page() {
        return <ul><For each={x()}>{(n) => <Row n={n} />}</For></ul>;
      }`,
    served: "<ul><li>a</li></ul>",
    steps: [[["", "b", "a"], "<ul><li>b</li><li>a</li></ul>"]],
  },
  "a <For> of rows that all return null": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["", ""]);
      export const set = setX;
      function Row(props) {
        if (props.n === "") return null;
        return <li>{props.n}</li>;
      }
      export default function Page() {
        return <ul><li>first</li><For each={x()}>{(n) => <Row n={n} />}</For></ul>;
      }`,
    served: "<ul><li>first</li></ul>",
    steps: [[["", "a"], "<ul><li>first</li><li>a</li></ul>"]],
  },
  "a <For> row that turns from null into an element": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(false);
      export const set = setX;
      function Row(props) {
        return () => (x() || props.n === 1 ? <li>{props.n}</li> : null);
      }
      export default function Page() {
        return (
          <ul>
            <For each={[1, 2]}>{(n) => <Row n={n} />}</For>
            <li>last</li>
          </ul>
        );
      }`,
    served: "<ul><li>1</li><li>last</li></ul>",
    steps: [
      [true, "<ul><li>1</li><li>2</li><li>last</li></ul>"],
      [false, "<ul><li>1</li><li>last</li></ul>"],
    ],
  },
  "a <For> whose last row is an empty string": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["a", ""]);
      export const set = setX;
      export default function Page() {
        return <p><b>x</b><For each={x()}>{(n) => n}</For><b>y</b></p>;
      }`,
    served: "<p><b>x</b>a<b>y</b></p>",
    steps: [[["", "c", "a"], "<p><b>x</b>ca<b>y</b></p>"]],
  },
  "a <For> whose row is an empty string": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["a", "", "b"]);
      export const set = setX;
      export default function Page() {
        return <p><For each={x()}>{(n) => n}</For></p>;
      }`,
    served: "<p>ab</p>",
    steps: [[["", "c"], "<p>c</p>"]],
  },
  "a <For> whose row is an empty string or a link": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(["", "http://a", " tail"]);
      export const set = setX;
      export default function Page() {
        return (
          <p>
            <For each={x()}>{(n) => (n.startsWith("http") ? <a href={n}>{n}</a> : n)}</For>
          </p>
        );
      }`,
    served: '<p><a href="http://a">http://a</a> tail</p>',
    steps: [[["x ", "http://b", ""], '<p>x <a href="http://b">http://b</a></p>']],
  },
  "a <For> row that renders undefined": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal([1, 2, 3]);
      export const set = setX;
      export default function Page() {
        return <ul><For each={x()}>{(n) => (n === 2 ? undefined : <li>{n}</li>)}</For></ul>;
      }`,
    served: "<ul><li>1</li><li>3</li></ul>",
    steps: [[[2, 3], "<ul><li>3</li></ul>"]],
  },
  "a <Show> that renders null": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(true);
      export const set = setX;
      export default function Page() {
        return <div><b>x</b><Show when={x()} fallback={<i>off</i>}>{null}</Show><b>y</b></div>;
      }`,
    served: "<div><b>x</b><b>y</b></div>",
    steps: [
      [false, "<div><b>x</b><i>off</i><b>y</b></div>"],
      [true, "<div><b>x</b><b>y</b></div>"],
    ],
  },
  "a <Show> that renders an empty string": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(true);
      export const set = setX;
      export default function Page() {
        return <div><b>x</b><Show when={x()} fallback={"off"}>{""}</Show><b>y</b></div>;
      }`,
    served: "<div><b>x</b><b>y</b></div>",
    steps: [
      [false, "<div><b>x</b>off<b>y</b></div>"],
      [true, "<div><b>x</b><b>y</b></div>"],
    ],
  },
  "a <Show> alone that renders an empty string": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal("");
      export const set = setX;
      export default function Page() {
        return <div><Show when={true}>{x()}</Show></div>;
      }`,
    served: "<div></div>",
    steps: [
      ["on", "<div>on</div>"],
      ["", "<div></div>"],
    ],
  },
  "a <Switch> arm that renders null or an empty string": {
    source: `
      import { Match, Switch, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(1);
      export const set = setX;
      export default function Page() {
        return (
          <div>
            <b>x</b>
            <Switch fallback={<i>none</i>}>
              <Match when={x() === 1}>{null}</Match>
              <Match when={x() === 2}>{""}</Match>
            </Switch>
            <b>y</b>
          </div>
        );
      }`,
    served: "<div><b>x</b><b>y</b></div>",
    steps: [
      [2, "<div><b>x</b><b>y</b></div>"],
      [3, "<div><b>x</b><i>none</i><b>y</b></div>"],
      [1, "<div><b>x</b><b>y</b></div>"],
    ],
  },
  "a component that returns false or undefined": {
    source: `
      import { createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(false);
      export const set = setX;
      function Never() { return false; }
      function Nothing() { return undefined; }
      function Maybe() { return () => (x() ? <em>on</em> : null); }
      export default function Page() {
        return <div><b>x</b><Never /><Nothing /><Maybe /><b>y</b></div>;
      }`,
    served: "<div><b>x</b><b>y</b></div>",
    steps: [
      [true, "<div><b>x</b><em>on</em><b>y</b></div>"],
      [false, "<div><b>x</b><b>y</b></div>"],
    ],
  },
  "a text that is empty on the server and filled after": {
    source: `
      import { createSignal } from "@barqjs/core";
      const [x, setX] = createSignal("");
      export const set = setX;
      export default function Page() {
        return <p><b>x</b>{x()}<b>y</b></p>;
      }`,
    served: "<p><b>x</b><b>y</b></p>",
    steps: [
      ["text", "<p><b>x</b>text<b>y</b></p>"],
      ["", "<p><b>x</b><b>y</b></p>"],
    ],
  },
  "a lone text that is empty on the server and filled after": {
    source: `
      import { createSignal } from "@barqjs/core";
      const [x, setX] = createSignal("");
      export const set = setX;
      export default function Page() {
        return <p>{x()}</p>;
      }`,
    served: "<p></p>",
    steps: [
      ["text", "<p>text</p>"],
      ["", "<p></p>"],
    ],
  },
  "a null that becomes an element": {
    source: `
      import { createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(null);
      export const set = setX;
      export default function Page() {
        return <p><b>x</b>{x() === null ? null : <i>{x()}</i>}<b>y</b></p>;
      }`,
    served: "<p><b>x</b><b>y</b></p>",
    steps: [
      ["on", "<p><b>x</b><i>on</i><b>y</b></p>"],
      [null, "<p><b>x</b><b>y</b></p>"],
    ],
  },
};

describe("an empty or null child hydrates whatever `dev` each half was built with", () => {
  for (const [name, { source, served, steps }] of Object.entries(CASES)) {
    for (const server of BUILDS) {
      for (const client of BUILDS) {
        test(`${name}: ${server} server, ${client} client`, async () => {
          const web = await import("@barqjs/web");
          const core = await import("@barqjs/core");
          const [ssr, dom] = await compile(source, server, client);
          const container = host(wire(ssr));
          const before = census(container);
          const dispose = web.hydrate(dom.default as never, container);
          try {
            const report = web.hydrate.report;
            expect({ recovered: report.recovered, mismatches: report.mismatches }).toEqual({
              recovered: false,
              mismatches: [],
            });
            expect(reuse(before, container).percent).toBe(100);
            expect(shape(container)).toBe(served);

            const parent = container.firstElementChild;
            for (const [next, markup] of steps) {
              dom.set(next);
              core.flush();
              expect(shape(container)).toBe(markup);
            }
            expect(container.firstElementChild).toBe(parent);
          } finally {
            dispose();
            container.remove();
          }
        });
      }
    }
  }
});
