import { describe, expect, test } from "bun:test";

import { compileSource, loadModule, type FixtureModule } from "./harness.ts";
import { census, host, reuse, shape, wire } from "./hydration.ts";

/**
 * JSX written as a value that something renders later: an item's icon in an
 * array of items, an object handed to a component as a prop, a signal's value.
 *
 * Built where it was written, such JSX ran outside the claim walk of the
 * position that finally inserts it. On a hydrating page its templates claimed
 * whatever server node the walk had reached, usually the root of the
 * component the items were being handed to, and the browser reported a
 * `structure` mismatch and rebuilt the region. Compiled as a Block instead, it
 * is built where it is inserted, and claims the nodes the server wrote there.
 */

type Build = "production" | "development";
const BUILDS: readonly Build[] = ["production", "development"];

interface Page extends FixtureModule {
  set(next: unknown): void;
}

let serial = 0;

async function compile(source: string, server: Build, client: Build): Promise<[Page, Page]> {
  const tag = `stored-jsx-${serial++}`;
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

/** An action bar's shape: items rendered through a callback, an icon behind a `<Show>`. */
const BAR = `
  function Glyph() {
    return <svg class="glyph"><path d="M0 0" /></svg>;
  }
  function Bar(props) {
    return (
      <div role="toolbar">
        <For each={props.items}>
          {(item) => (
            <button type="button">
              <Show when={item.icon !== undefined}><span class="icon">{item.icon}</span></Show>
              <Show when={labelled()}>{item.label}</Show>
            </button>
          )}
        </For>
      </div>
    );
  }
`;

const GLYPH = '<svg class="glyph"><path d="M0 0"></path></svg>';

interface Case {
  source: string;
  served: string;
  /** The value `set` is given after hydration, and the markup it leaves. */
  next: unknown;
  toggled: string;
}

const CASES: Record<string, Case> = {
  "items written in a prop, with component icons": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled, setLabelled] = createSignal(true);
      export const set = setLabelled;
      ${BAR}
      export default function Page() {
        return (
          <main>
            <h1>Invoice</h1>
            <Bar items={[{ label: "Copy", icon: <Glyph /> }, { label: "Send" }]} />
          </main>
        );
      }`,
    served: `<main><h1>Invoice</h1><div role="toolbar"><button type="button"><span class="icon">${GLYPH}</span>Copy</button><button type="button">Send</button></div></main>`,
    next: false,
    toggled: `<main><h1>Invoice</h1><div role="toolbar"><button type="button"><span class="icon">${GLYPH}</span></button><button type="button"></button></div></main>`,
  },
  "items declared at module scope, with element icons": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled, setLabelled] = createSignal(true);
      export const set = setLabelled;
      ${BAR}
      const items = [
        { label: "Copy", icon: (<b class="mark">c</b>) },
        { label: "Send", icon: true ? <i>s</i> : null },
      ];
      export default function Page() {
        return <main><Bar items={items} /></main>;
      }`,
    served:
      '<main><div role="toolbar"><button type="button"><span class="icon"><b class="mark">c</b></span>Copy</button><button type="button"><span class="icon"><i>s</i></span>Send</button></div></main>',
    next: false,
    toggled:
      '<main><div role="toolbar"><button type="button"><span class="icon"><b class="mark">c</b></span></button><button type="button"><span class="icon"><i>s</i></span></button></div></main>',
  },
  "an array of JSX in a local": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [shown, setShown] = createSignal(true);
      export const set = setShown;
      function Glyph() {
        return <svg class="glyph"><path d="M0 0" /></svg>;
      }
      export default function Page() {
        const parts = [<em>first</em>, <Glyph />];
        return (
          <main>
            <p>{parts[1]}</p>
            <Show when={shown()}><p>{parts[0]}</p></Show>
          </main>
        );
      }`,
    served: `<main><p>${GLYPH}</p><p><em>first</em></p></main>`,
    next: false,
    toggled: `<main><p>${GLYPH}</p></main>`,
  },
  "a prop carrying an object that holds JSX": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [open, setOpen] = createSignal(false);
      export const set = setOpen;
      function Glyph() {
        return <svg class="glyph"><path d="M0 0" /></svg>;
      }
      function Card(props) {
        return (
          <section>
            <h2>{props.item.title}</h2>
            {props.item.icon}
            <Show when={open()}><p>{props.item.body}</p></Show>
          </section>
        );
      }
      export default function Page() {
        return (
          <main>
            <Card item={{ title: "Plan", icon: <Glyph />, body: <strong>Team</strong> }} />
          </main>
        );
      }`,
    served: `<main><section><h2>Plan</h2>${GLYPH}</section></main>`,
    next: true,
    toggled: `<main><section><h2>Plan</h2>${GLYPH}<p><strong>Team</strong></p></section></main>`,
  },
  "a JSX prop a component puts into its items": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled, setLabelled] = createSignal(true);
      export const set = setLabelled;
      ${BAR}
      function Download(props) {
        return <Bar items={[{ label: "Download", icon: props.icon }]} />;
      }
      export default function Page() {
        return <main><Download icon={<Glyph />} /></main>;
      }`,
    served: `<main><div role="toolbar"><button type="button"><span class="icon">${GLYPH}</span>Download</button></div></main>`,
    next: false,
    toggled: `<main><div role="toolbar"><button type="button"><span class="icon">${GLYPH}</span></button></div></main>`,
  },
  "JSX a signal holds, then a setter writes": {
    source: `
      import { createSignal } from "@barqjs/core";
      function Glyph() {
        return <svg class="glyph"><path d="M0 0" /></svg>;
      }
      const [icon, setIcon] = createSignal(<Glyph />);
      export const set = (bold) => setIcon(bold ? <b>on</b> : <i>off</i>);
      export default function Page() {
        return <main><h1>Status</h1><span>{icon()}</span></main>;
      }`,
    served: `<main><h1>Status</h1><span>${GLYPH}</span></main>`,
    next: true,
    toggled: "<main><h1>Status</h1><span><b>on</b></span></main>",
  },
  "items with icons a signal holds": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled] = createSignal(true);
      let replace;
      export const set = (next) => replace(next);
      ${BAR}
      export default function Page() {
        const [items, setItems] = createSignal([{ label: "Copy", icon: <Glyph /> }]);
        replace = (label) => setItems([{ label, icon: <i>new</i> }]);
        return <main><Bar items={items()} /></main>;
      }`,
    served: `<main><div role="toolbar"><button type="button"><span class="icon">${GLYPH}</span>Copy</button></div></main>`,
    next: "Send",
    toggled:
      '<main><div role="toolbar"><button type="button"><span class="icon"><i>new</i></span>Send</button></div></main>',
  },
};

describe("JSX stored as a value hydrates where it is inserted", () => {
  for (const [name, { source, served, next, toggled }] of Object.entries(CASES)) {
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

            // What was claimed stays live, inside the element the server sent.
            const main = container.firstElementChild;
            dom.set(next);
            core.flush();
            expect(shape(container)).toBe(toggled);
            expect(container.firstElementChild).toBe(main);
          } finally {
            dispose();
            container.remove();
          }
        });
      }
    }
  }
});

describe("what the compiler makes of JSX written as a value", () => {
  const emitted = (source: string): string => compileSource(source, "stored.tsx", {});

  test("an object property, an array member and a signal's value are Blocks", () => {
    const code = emitted(`
      import { createSignal } from "@barqjs/core";
      function Glyph() { return <svg />; }
      const item = { icon: <Glyph />, mark: <b>m</b> };
      const parts = [<i>a</i>];
      const [icon, setIcon] = createSignal(<Glyph />);
      export const swap = () => setIcon(<u>u</u>);
    `);
    expect(code).toContain("icon: _$block(() => _$createComponent(Glyph, {}))");
    expect(code).toMatch(/mark: _\$block\(\(\) => _tmpl\$\d+\(\)\)/);
    expect(code).toMatch(/const parts = \[_\$block\(\(\) => _tmpl\$\d+\(\)\)\]/);
    expect(code).toContain("createSignal([_$block(() => _$createComponent(Glyph, {}))])");
    expect(code).toMatch(/setIcon\(\[_\$block\(\(\) => _tmpl\$\d+\(\)\)\]\)/);
  });

  test("JSX that is rendered where it is written stays as it is", () => {
    const code = emitted(`
      function Row() { return <li />; }
      const node = <div />;
      export function List() { return [<Row />, <hr />]; }
      export const rows = () => [<Row />];
      export function Hole() { return <ul>{[<Row />, <hr />]}</ul>; }
      export const listen = (host) => host.append(<p />);
    `);
    expect(code).not.toContain("_$block");
  });
});
