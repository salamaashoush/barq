/**
 * An async value declared without a key is seeded under where it stands in the
 * page, and the client has to look for it in the same place.
 *
 * The two backends do not build the same graph: the DOM one opens an effect per
 * live binding, a memo per branch key and the engine's own owners inside every
 * boundary and list, and the string one opens none of them. Each shape below
 * puts one of those between the root and a value, or beside it, renders the
 * page on the server, and hydrates the compiled DOM module over the result. The
 * value's fetcher must not run again, and the value shown must be its own.
 */

import { expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";
import { assemble } from "./stream.ts";

const HEAD = `
import {
  Dynamic, Errored, For, Loading, Match, Portal, Repeat, Show, Switch,
  createContext, createMemo, createSignal, lazy, useContext,
} from "@barqjs/core"
export const counts = { fetches: 0 }
function Read(props) {
  const tag = props.tag()
  const value = createMemo(async () => {
    counts.fetches++
    return "value-" + tag
  })
  return <b class={tag}>{value()}</b>
}
function Live() {
  const [n] = createSignal(1)
  return <span class={n() > 0 ? "on" : "off"} title={"t" + n()}>{n()}{" "}{n() + 1}</span>
}
`;

interface Shape {
  /** What the page fetches, which is what it has to seed and show. */
  values: string[];
  source: string;
}

const SHAPES: Record<string, Shape> = {
  "a value alone in a boundary": {
    values: ["value-a"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}><Read tag="a" /></Loading></div>
}`,
  },
  "live bindings before the boundary": {
    values: ["value-a"],
    source: `
export default function Page() {
  return <div><Live /><Loading fallback={<i>wait</i>}><Read tag="a" /></Loading></div>
}`,
  },
  "live bindings between two values": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Live /><Read tag="a" /><Live /><Read tag="b" />
  </Loading></div>
}`,
  },
  "a boundary after a boundary": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  return <div>
    <Loading fallback={<i>wait</i>}><Read tag="a" /></Loading>
    <Loading fallback={<i>wait</i>}><Read tag="b" /></Loading>
  </div>
}`,
  },
  "a value declared above the boundaries that read it": {
    values: ["value-top", "value-a", "value-b"],
    source: `
export default function Page() {
  const top = createMemo(async () => { counts.fetches++; return "value-top" })
  const [n] = createSignal(1)
  return <div title={"t" + n()}>
    <Loading fallback={<i>wait</i>}><b class="top">{top()}</b><Read tag="a" /></Loading>
    <Loading fallback={<i>wait</i>}><Read tag="b" /></Loading>
  </div>
}`,
  },
  "a derived memo before the boundary": {
    values: ["value-a"],
    source: `
export default function Page() {
  const [n] = createSignal(1)
  const double = createMemo(() => n() * 2)
  return <div><p>{double()}</p><Loading fallback={<i>wait</i>}><Read tag="a" /></Loading></div>
}`,
  },
  "a boundary inside a boundary": {
    values: ["value-a", "value-b", "value-c"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Read tag="a" />
    <Loading fallback={<i>inner</i>}><Read tag="b" /></Loading>
    <Read tag="c" />
  </Loading></div>
}`,
  },
  "Show, then a sibling": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [on] = createSignal(true)
  return <div><Loading fallback={<i>wait</i>}>
    <Show when={on()}><Read tag="a" /></Show>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Show on its fallback arm": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [on] = createSignal(false)
  return <div><Loading fallback={<i>wait</i>}>
    <Show when={on()} fallback={<Read tag="a" />}><p>shown</p></Show>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Show through a spread": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [on] = createSignal(true)
  const options = { get when() { return on() } }
  return <div><Loading fallback={<i>wait</i>}>
    <Show {...options}><Read tag="a" /></Show>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "a conditional expression": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [on] = createSignal(true)
  return <div><Loading fallback={<i>wait</i>}>
    {on() ? <Read tag="a" /> : null}
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Switch, then a sibling": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [which] = createSignal(2)
  return <div><Loading fallback={<i>wait</i>}>
    <Switch fallback={<p>none</p>}>
      <Match when={which() === 1}><p>one</p></Match>
      <Match when={which() === 2}><Read tag="a" /></Match>
    </Switch>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Dynamic, then a sibling": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  const [which] = createSignal(() => Read)
  return <div><Loading fallback={<i>wait</i>}>
    <Dynamic component={which()} tag="a" />
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "For rows, then a sibling": {
    values: ["value-x", "value-y", "value-b"],
    source: `
export default function Page() {
  const [rows] = createSignal(["x", "y"])
  return <div><Loading fallback={<i>wait</i>}>
    <For each={rows()}>{(row) => <Read tag={row} />}</For>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Repeat rows, then a sibling": {
    values: ["value-r0", "value-r1", "value-b"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Repeat count={2}>{(i) => <Read tag={"r" + i} />}</Repeat>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "Errored, then a sibling": {
    values: ["value-a", "value-b"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Errored fallback={(e) => <p>failed</p>}><Read tag="a" /></Errored>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "a portal before the value": {
    values: ["value-a"],
    source: `
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Portal mount={document.body}><p>elsewhere</p></Portal>
    <Read tag="a" />
  </Loading></div>
}`,
  },
  "a context provider around the value": {
    values: ["value-dark", "value-b"],
    source: `
const Theme = createContext("light")
function Themed() {
  const theme = useContext(Theme)
  return <Read tag={theme()} />
}
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Theme value="dark"><Themed /></Theme>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "a value in a children slot": {
    values: ["value-a", "value-b"],
    source: `
function Card(props) {
  return <section class="card">{props.children}</section>
}
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Card><Read tag="a" /></Card>
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "a lazy component, then a sibling": {
    values: ["value-a", "value-b"],
    source: `
const Late = lazy(() => Promise.resolve({ default: Read }))
export const preload = () => Late.preload()
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}>
    <Late tag="a" />
    <Read tag="b" />
  </Loading></div>
}`,
  },
  "a value that waits on another": {
    values: ["value-a", "after value-a"],
    source: `
function Chain() {
  const first = createMemo(async () => {
    counts.fetches++
    await new Promise((done) => setTimeout(done, 2))
    return "value-a"
  })
  const second = createMemo(async () => {
    const head = first()
    counts.fetches++
    return "after " + head
  })
  return <b>{first()} {second()}</b>
}
export default function Page() {
  return <div><Loading fallback={<i>wait</i>}><Chain /></Loading></div>
}`,
  },
};

type Mode = "buffered" | "streamed";

let serial = 0;

async function roundTrip(source: string, mode: Mode) {
  const compiled = await compileText(HEAD + source, `async-key-${mode}-${serial++}`, true, false);
  const core = await import("@barqjs/core");
  const server = await import("@barqjs/server");
  const seeded = globalThis as { __BARQ_DATA__?: Record<string, unknown> };
  seeded.__BARQ_DATA__ = undefined;

  const container = host("");
  let data: Record<string, unknown> | undefined;
  if (mode === "buffered") {
    const page = await server.renderPage((() => compiled.ssr.default()) as never);
    container.innerHTML = page.html;
    data = page.data;
  } else {
    await assemble(compiled.ssr, container);
  }
  const served = container.textContent;
  const fetchedOnServer = (compiled.ssr as unknown as { counts: { fetches: number } }).counts
    .fetches;

  // The module a lazy component names is on the page before the client starts,
  // which is what a route's modulepreload is for.
  await (compiled.dom as { preload?: () => Promise<void> }).preload?.();
  core.resetChildIds();
  const dispose = core.hydrate(
    compiled.dom.default as never,
    container,
    data === undefined ? undefined : { data },
  );
  const result = {
    served,
    fetchedOnServer,
    fetchedOnClient: (compiled.dom as unknown as { counts: { fetches: number } }).counts.fetches,
    unclaimed: Object.keys(seeded.__BARQ_DATA__ ?? {}),
    shown: container.textContent,
    recovered: core.hydrate.report.recovered,
  };
  dispose();
  container.remove();
  seeded.__BARQ_DATA__ = undefined;
  return result;
}

for (const mode of ["buffered", "streamed"] as const) {
  for (const [name, shape] of Object.entries(SHAPES)) {
    test(`${name}: the client reads what the ${mode} server seeded`, async () => {
      const result = await roundTrip(shape.source, mode);

      expect(result.fetchedOnServer).toBe(shape.values.length);
      for (const value of shape.values) expect(result.served).toContain(value);

      expect({
        fetchedOnClient: result.fetchedOnClient,
        unclaimed: result.unclaimed,
        recovered: result.recovered,
      }).toEqual({ fetchedOnClient: 0, unclaimed: [], recovered: false });
      for (const value of shape.values) expect(result.shown).toContain(value);
      expect(result.shown).not.toContain("wait");
    });
  }
}
