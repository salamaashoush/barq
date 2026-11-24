import { describe, expect, test } from "bun:test";

import { compileSource, loadModule, type FixtureModule } from "./harness.ts";
import { census, host, reuse, shape, wire } from "./hydration.ts";

/**
 * A `<Show>` or `<Match>` whose lone child is a value the compiler cannot see
 * the kind of: a member of a render callback's parameter, or an import.
 *
 * Solid 2.0 decides such a child when the arm is built (called if it declares
 * a parameter, rendered otherwise), and the flow pass used to leave the
 * construct to its adapter for that. The adapter has no hydration flags, so
 * the browser reported it `not-hydratable` and built it again. It is the shape
 * a collection's item takes: `{(item) => <Item><Show when={…}>{item.label}
 * </Show></Item>}`, rendered through a component that calls the callback per
 * item, inside a list.
 */

type Build = "production" | "development";
const BUILDS: readonly Build[] = ["production", "development"];

interface Page extends FixtureModule {
  set(next: unknown): void;
}

let serial = 0;

async function compile(source: string, server: Build, client: Build): Promise<[Page, Page]> {
  const tag = `unknown-child-${serial++}`;
  const dom = compileSource(source, `${tag}.tsx`, {
    hydratable: true,
    dev: client === "development",
  });
  const ssr = compileSource(source, `${tag}.tsx`, {
    ssr: true,
    hydratable: true,
    dev: server === "development",
  });
  expect(dom).toContain("callSlot");
  expect(dom).not.toMatch(/\bShow\(\{|createComponent\(Show|createComponent\(Switch/);
  expect(ssr).not.toMatch(/\bShow\(\{|createComponent\(Show|createComponent\(Switch/);
  return [
    (await loadModule(ssr, `${tag}-ssr`)) as Page,
    (await loadModule(dom, `${tag}-dom`)) as Page,
  ];
}

/** A collection that renders each item through the callback it is handed. */
const COLLECTION = `
  function Group(props) {
    return <div role="toolbar"><For each={props.items}>{(item) => props.children(item)}</For></div>;
  }
  function Item(props) {
    return <button type="button">{props.children}</button>;
  }
`;

interface Case {
  source: string;
  served: string;
  next: unknown;
  toggled: string;
}

const CASES: Record<string, Case> = {
  "a text child beside an element child, in a collection's item": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled, setLabelled] = createSignal(true);
      export const set = setLabelled;
      ${COLLECTION}
      export default function Page() {
        return (
          <Group items={[{ id: "a", label: "Copy", icon: "*" }, { id: "b", label: "Send" }]}>
            {(action) => (
              <Item>
                <Show when={action.icon !== undefined}><i>{action.icon}</i></Show>
                <Show when={labelled()}>{action.label}</Show>
              </Item>
            )}
          </Group>
        );
      }`,
    served:
      '<div role="toolbar"><button type="button"><i>*</i>Copy</button><button type="button">Send</button></div>',
    next: false,
    toggled:
      '<div role="toolbar"><button type="button"><i>*</i></button><button type="button"></button></div>',
  },
  "a lone text child, alone in its element": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [labelled, setLabelled] = createSignal(true);
      export const set = setLabelled;
      ${COLLECTION}
      export default function Page() {
        return (
          <Group items={[{ label: "Copy" }, { label: "Send" }]}>
            {(action) => <Item><span><Show when={labelled()} fallback="-">{action.label}</Show></span></Item>}
          </Group>
        );
      }`,
    served:
      '<div role="toolbar"><button type="button"><span>Copy</span></button><button type="button"><span>Send</span></button></div>',
    next: false,
    toggled:
      '<div role="toolbar"><button type="button"><span>-</span></button><button type="button"><span>-</span></button></div>',
  },
  "a render callback child, called with the value": {
    source: `
      import { For, Show, createSignal } from "@barqjs/core";
      const [name, setName] = createSignal("salama");
      export const set = setName;
      ${COLLECTION}
      export default function Page() {
        return (
          <Group items={[{ render: (value) => <b>{value()}</b> }]}>
            {(action) => <Item><Show when={name()}>{action.render}</Show></Item>}
          </Group>
        );
      }`,
    served: '<div role="toolbar"><button type="button"><b>salama</b></button></div>',
    next: "acme",
    toggled: '<div role="toolbar"><button type="button"><b>acme</b></button></div>',
  },
  "a <Match> over a text child": {
    source: `
      import { For, Match, Switch, createSignal } from "@barqjs/core";
      const [on, setOn] = createSignal(true);
      export const set = setOn;
      ${COLLECTION}
      export default function Page() {
        return (
          <Group items={[{ label: "Copy" }]}>
            {(action) => (
              <Item>
                <Switch fallback="off"><Match when={on()}>{action.label}</Match></Switch>
              </Item>
            )}
          </Group>
        );
      }`,
    served: '<div role="toolbar"><button type="button">Copy</button></div>',
    next: false,
    toggled: '<div role="toolbar"><button type="button">off</button></div>',
  },
};

describe("a Show or Match over a child of unknown kind hydrates", () => {
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

            const toolbar = container.firstElementChild;
            dom.set(next);
            core.flush();
            expect(shape(container)).toBe(toggled);
            expect(container.firstElementChild).toBe(toolbar);
          } finally {
            dispose();
            container.remove();
          }
        });
      }
    }
  }
});
