import { describe, expect, test } from "bun:test";

import { compileSource, loadModule, type FixtureModule } from "./harness.ts";
import { census, host, reuse, shape, wire } from "./hydration.ts";

/**
 * A control-flow region that is its element's only child.
 *
 * Such a range owns its parent's child list, so the string backend writes it no
 * boundary comments and the client claims every child of the parent. Both
 * halves are told that by their own build, and the halves of one page need not
 * share `dev`: the server and the browser are compiled separately. While a
 * development build kept the comments there, a development client found none
 * in a production server's markup (and a production client took a development
 * server's comments for content), so every lone `<Show>`, `<For>` and
 * `<Switch>` reported a mismatch and was rebuilt instead of claimed.
 */

type Build = "production" | "development";
const BUILDS: readonly Build[] = ["production", "development"];

interface Page extends FixtureModule {
  set(next: unknown): void;
}

let serial = 0;

async function compile(source: string, server: Build, client: Build): Promise<[Page, Page]> {
  const tag = `sole-region-${serial++}`;
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
  /** The value `set` is given after hydration, and the markup it leaves. */
  next: unknown;
  toggled: string;
}

const CASES: Record<string, Case> = {
  "a <Show> that renders": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(true);
      export const set = setX;
      export default function Page() {
        return <div class="w"><Show when={x()}><span>yes</span></Show></div>;
      }`,
    served: '<div class="w"><span>yes</span></div>',
    next: false,
    toggled: '<div class="w"></div>',
  },
  "a <Show> that renders nothing": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(false);
      export const set = setX;
      export default function Page() {
        return <div class="w"><Show when={x()}><span>yes</span></Show></div>;
      }`,
    served: '<div class="w"></div>',
    next: true,
    toggled: '<div class="w"><span>yes</span></div>',
  },
  "a keyed <Show> handing its child the value": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(null);
      export const set = setX;
      export default function Page() {
        return (
          <section>
            <canvas />
            <div class="host"><Show when={x()} keyed>{(v) => <textarea aria-label={v} />}</Show></div>
            <p>after</p>
          </section>
        );
      }`,
    served: '<section><canvas></canvas><div class="host"></div><p>after</p></section>',
    next: "Text",
    toggled:
      '<section><canvas></canvas><div class="host"><textarea aria-label="Text"></textarea></div><p>after</p></section>',
  },
  "a <For>": {
    source: `
      import { For, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal([1, 2]);
      export const set = setX;
      export default function Page() {
        return <ul><For each={x()}>{(n) => <li>{n}</li>}</For></ul>;
      }`,
    served: "<ul><li>1</li><li>2</li></ul>",
    next: [1, 2, 3],
    toggled: "<ul><li>1</li><li>2</li><li>3</li></ul>",
  },
  "a <Switch>": {
    source: `
      import { Match, Switch, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(1);
      export const set = setX;
      export default function Page() {
        return (
          <div>
            <Switch fallback={<i>none</i>}>
              <Match when={x() === 1}><b>one</b></Match>
              <Match when={x() === 2}><b>two</b></Match>
            </Switch>
          </div>
        );
      }`,
    served: "<div><b>one</b></div>",
    next: 3,
    toggled: "<div><i>none</i></div>",
  },
  "a <Show> alone inside a <Show> alone": {
    source: `
      import { Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(true);
      export const set = setX;
      export default function Page() {
        return (
          <div>
            <Show when={true}>
              <p><Show when={x()} fallback={<i>off</i>}><b>on</b></Show></p>
            </Show>
          </div>
        );
      }`,
    served: "<div><p><b>on</b></p></div>",
    next: false,
    toggled: "<div><p><i>off</i></p></div>",
  },
  "a <For> of rows that each hold a lone <Show>": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [x, setX] = createSignal(true);
      export const set = setX;
      export default function Page() {
        return (
          <ul>
            <For each={["a", "b"]}>{(n) => <li><Show when={x()} fallback={"-"}>{n}</Show></li>}</For>
          </ul>
        );
      }`,
    served: "<ul><li>a</li><li>b</li></ul>",
    next: false,
    toggled: "<ul><li>-</li><li>-</li></ul>",
  },
};

describe("a lone control-flow child hydrates whatever `dev` each half was built with", () => {
  for (const [name, { source, served, next, toggled }] of Object.entries(CASES)) {
    for (const server of BUILDS) {
      for (const client of BUILDS) {
        test(`${name}: ${server} server, ${client} client`, async () => {
          const web = await import("@barqjs/web");
          const core = await import("@barqjs/core");
          const [ssr, dom] = await compile(source, server, client);
          const markup = wire(ssr);
          // No boundary comments in either build: the range owns its element.
          expect(markup).not.toContain("<!--[");
          const container = host(markup);
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

            // The claimed range stays live: the next write reaches the nodes
            // the server sent, and the element around it is still the server's.
            const parent = container.firstElementChild;
            dom.set(next);
            core.flush();
            expect(shape(container)).toBe(toggled);
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
