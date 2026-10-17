/**
 * Solid 2.0's hydration surface, `NoHydration`, `Hydration`, `isHydratable`,
 * `clientOnly` and `onHydrationEnd`, through both backends: the string module
 * renders the page, and the DOM module hydrates over it.
 */

import { describe, expect, test } from "bun:test";

import { census, compileText, host, reuse } from "./hydration.ts";
import { chunksOf, scriptsOf, withoutScripts } from "./stream.ts";

let serial = 0;

type Counts = { fetches: number; imports: number; hydratable: Record<string, boolean[]> };

async function compiled(source: string) {
  const out = await compileText(source, `hydration-api-${serial++}`, true, false);
  const counts = (mod: unknown): Counts => (mod as { counts: Counts }).counts;
  return { ...out, server: counts(out.ssr), client: counts(out.dom) };
}

async function served(mod: { default: unknown }) {
  const server = await import("@barqjs/server");
  return server.renderPage((() => (mod.default as () => unknown)()) as never);
}

/** What `isHydratable` answered in each component, once per distinct answer: a server render builds more than once. */
const answers = (counts: Counts): Record<string, boolean[]> =>
  Object.fromEntries(
    Object.entries(counts.hydratable).map(([name, seen]) => [name, [...new Set(seen)]]),
  );

const microtasks = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

const COUNTS = `
export const counts = { fetches: 0, imports: 0, hydratable: {} }
function note(name) {
  ;(counts.hydratable[name] ??= []).push(isHydratable())
}
`;

describe("NoHydration and Hydration", () => {
  const PAGE = `
import { Hydration, Loading, NoHydration, createMemo, createSignal, isHydratable } from "@barqjs/core"
${COUNTS}
function Read(props) {
  note(props.name())
  const value = createMemo(async () => {
    counts.fetches++
    return "value-" + props.name()
  })
  return <b class={props.name()}>{value()}</b>
}
export function Widget() {
  note("widget")
  const [n, setN] = createSignal(0)
  const value = createMemo(async () => {
    counts.fetches++
    return "value-widget"
  })
  return <button onClick={() => setN(n() + 1)}>{value()} {n()}</button>
}
export function Region() {
  return <Loading fallback={<i>wait</i>}><Widget /></Loading>
}
export default function Page() {
  note("page")
  return (
    <main>
      <NoHydration>
        <Loading fallback={<i>wait</i>}><Read name="static" /></Loading>
        <section id="w"><Hydration id="w-"><Region /></Hydration></section>
      </NoHydration>
      <Loading fallback={<i>wait</i>}><Read name="after" /></Loading>
    </main>
  )
}`;

  test("the server keeps what is under NoHydration off the page and seeds what Hydration re-enters", async () => {
    const page = await compiled(PAGE);
    const { html, data } = await served(page.ssr);

    expect(html).toContain("value-static");
    expect(html).toContain("value-widget");
    expect(Object.values(data ?? {}).toSorted()).toEqual(["value-after", "value-widget"]);
    expect(Object.keys(data ?? {}).filter((key) => key.startsWith("w-r0"))).toHaveLength(1);
    expect(answers(page.server)).toEqual({
      page: [true],
      static: [false],
      widget: [true],
      after: [true],
    });
  });

  test("the page claims around the island, and a root with the same id claims the region", async () => {
    const page = await compiled(PAGE);
    const { html, data } = await served(page.ssr);
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const container = host(html);
    const before = census(container);

    core.resetChildIds();
    const stopPage = web.hydrate(page.dom.default as never, container, { data });
    expect(web.hydrate.report.mismatches).toEqual([]);
    expect(web.hydrate.report.recovered).toBe(false);

    const region = container.querySelector("#w")!;
    const { Region } = page.dom as unknown as { Region: () => never };
    const stopRegion = web.hydrate(() => Region(), region as never, {
      renderId: "w-",
      data,
    });
    expect(web.hydrate.report.mismatches).toEqual([]);
    expect(web.hydrate.report.recovered).toBe(false);
    await microtasks();

    expect(reuse(before, container).percent).toBe(100);
    expect(page.client.fetches).toBe(0);
    expect(answers(page.client)).toEqual({ page: [true], after: [true], widget: [true] });

    const button = region.querySelector("button")!;
    button.click();
    core.flush();
    expect(button.textContent).toBe("value-widget 1");

    stopRegion();
    stopPage();
    container.remove();
  });

  test("on the client Hydration passes through, so its children stay unhydratable under NoHydration", async () => {
    const page = await compiled(PAGE);
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const container = host("");
    const stop = web.render(page.dom.default as never, container);
    await microtasks();
    core.flush();

    expect(answers(page.client)).toEqual({
      page: [true],
      static: [false],
      widget: [false],
      after: [true],
    });
    expect(container.querySelector("#w button")?.textContent).toBe("value-widget 0");
    stop();
    container.remove();
  });

  test("isHydratable is false with no owner, on either side", async () => {
    const core = await import("@barqjs/core");
    expect(core.isHydratable()).toBe(false);
  });
});

describe("clientOnly", () => {
  const PAGE = `
import { Loading, createMemo, createSignal, isHydratable } from "@barqjs/core"
import { clientOnly } from "@barqjs/web"
${COUNTS}
function Chart(props) {
  return <canvas data-name={props.name()} data-fallback={String("fallback" in props)} />
}
const ChartOnly = clientOnly(() => {
  counts.imports++
  return Promise.resolve({ default: Chart })
})
const Legend = clientOnly(
  () => {
    counts.imports++
    return Promise.resolve({ Legend: (props) => <ol>{props.items()}</ol> })
  },
  { lazy: true, export: "Legend" },
)
function Read(props) {
  const value = createMemo(async () => {
    counts.fetches++
    return "value-" + props.name()
  })
  return <b>{value()}</b>
}
export default function Page() {
  const [items] = createSignal(3)
  return (
    <main>
      <ChartOnly name="sales" fallback={<p class="skel">chart</p>} />
      <Legend items={items()} fallback={<p class="skel">legend</p>} />
      <Loading fallback={<i>wait</i>}><Read name="after" /></Loading>
    </main>
  )
}`;

  test("the server renders the fallback and never starts the import", async () => {
    const page = await compiled(PAGE);
    const { html } = await served(page.ssr);

    expect(page.ssrCode).toContain("_$clientOnly(");
    expect(page.server.imports).toBe(0);
    expect(html).toContain('<p class="skel">chart</p>');
    expect(html).toContain('<p class="skel">legend</p>');
    expect(html).not.toContain("<canvas");
  });

  test("the client claims the fallback, swaps after hydration ends, and keys what follows as the server did", async () => {
    const page = await compiled(PAGE);
    const { html, data } = await served(page.ssr);
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const container = host(html);
    const fallbacks = [...container.querySelectorAll(".skel")];

    core.resetChildIds();
    const stop = web.hydrate(page.dom.default as never, container, { data });
    expect(web.hydrate.report.mismatches).toEqual([]);
    expect(web.hydrate.report.recovered).toBe(false);
    expect([...container.querySelectorAll(".skel")]).toEqual(fallbacks);
    expect(page.client.fetches).toBe(0);
    // Eager for the first, deferred to the first render for the lazy one.
    expect(page.client.imports).toBe(2);

    await microtasks();
    core.flush();

    expect(container.querySelector(".skel")).toBeNull();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.getAttribute("data-name")).toBe("sales");
    expect(canvas.getAttribute("data-fallback")).toBe("false");
    expect(container.querySelector("ol")?.textContent).toBe("3");
    expect(container.querySelector("b")?.textContent).toBe("value-after");
    stop();
    container.remove();
  });

  test("a client render shows the fallback until the module lands, then the component", async () => {
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const { clientOnly } = web;
    let land!: () => void;
    let imports = 0;
    const Widget = clientOnly(() => {
      imports++;
      return new Promise<{ default: () => never }>((resolve) => {
        land = () => resolve({ default: () => document.createTextNode("widget") as never });
      });
    });
    const container = host("");
    const fallback = core.block(() => document.createTextNode("wait"));
    const stop = web.render(
      () => [Widget({ fallback } as never), Widget({ fallback } as never)] as never,
      container,
    );
    expect(container.textContent).toBe("waitwait");
    land();
    await microtasks();
    core.flush();
    expect(container.textContent).toBe("widgetwidget");
    expect(imports).toBe(1);
    stop();
    container.remove();
  });
});

describe("onHydrationEnd", () => {
  const PAGE = `
import { Loading, createMemo } from "@barqjs/core"
export default function Page() {
  const late = createMemo(() => new Promise((r) => setTimeout(() => r("LATE"), 0)))
  return (
    <div>
      <p>shell</p>
      <Loading fallback={<i class="skel">skel</i>}><b>{late()}</b></Loading>
    </div>
  )
}`;

  test("waits for a streamed boundary the root pass claimed a fallback for", async () => {
    const page = await compileText(PAGE, `hydration-api-${serial++}`, true, false);
    const core = await import("@barqjs/core");
    const web = await import("@barqjs/web");
    const chunks = await chunksOf(page.ssr);
    expect(chunks.length).toBeGreaterThan(1);
    const container = host("");
    const run = (chunk: string): void => {
      container.insertAdjacentHTML("beforeend", withoutScripts(chunk));
      for (const source of scriptsOf(chunk)) if (source.trim() !== "") (0, eval)(source);
    };

    run(chunks[0]!);
    expect(container.querySelector(".skel")).not.toBeNull();
    core.resetChildIds();
    let ended = false;
    const stop = web.hydrate(page.dom.default as never, container);
    web.onHydrationEnd(() => {
      ended = true;
    });
    await microtasks();
    expect(ended).toBe(false);

    for (const chunk of chunks.slice(1)) run(chunk);
    for (let i = 0; i < 5 && !ended; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      core.flush();
    }
    expect(container.querySelector("b")?.textContent).toBe("LATE");
    expect(ended).toBe(true);
    stop();
    container.remove();
    (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
  });
});
