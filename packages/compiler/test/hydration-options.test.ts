/**
 * A memo's `ssrSource` and `deferStream`, across the whole trip: the server's
 * bytes, the seed, and the client that hydrates over them.
 *
 * Each source is compiled for both backends, rendered by the string module and
 * hydrated by the DOM module over the result, so what is measured is what an
 * application gets. The fetch counts are per side: the two modules are two
 * module instances, and each counts its own.
 */

import { expect, test } from "bun:test";

import { compileText, host } from "./hydration.ts";
import { scriptsOf, withoutScripts } from "./stream.ts";

const HEAD = `
import { Loading, createMemo, isPending } from "@barqjs/core"
export const counts = { fetches: 0 }
export const release = { open: () => {} }
const later = () => new Promise((done) => setTimeout(done, 0))
`;

let serial = 0;

type Module = { default: () => unknown; counts: { fetches: number } };

async function compiled(source: string): Promise<{ ssr: Module; dom: Module }> {
  const both = await compileText(HEAD + source, `hydration-options-${serial++}`, true, false);
  return { ssr: both.ssr as unknown as Module, dom: both.dom as unknown as Module };
}

/** The stream's chunks, and every boundary deadline that fired while it ran. */
async function streamed(mod: Module): Promise<{ chunks: string[]; deadlines: number[] }> {
  const server = await import("@barqjs/server");
  const real = globalThis.setTimeout;
  const deadlines: number[] = [];
  globalThis.setTimeout = ((handler: (...args: unknown[]) => void, ms = 0, ...rest: unknown[]) =>
    real(
      (...passed: unknown[]) => {
        if (ms >= 1000) deadlines.push(ms);
        handler(...passed);
      },
      ms,
      ...rest,
    )) as unknown as typeof setTimeout;
  try {
    const reader = server.renderToStream((() => mod.default()) as never).readable.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }
    return { chunks, deadlines };
  } finally {
    globalThis.setTimeout = real;
  }
}

/** The page assembled the way a browser parses it, scripts run in order. */
function assembled(chunks: readonly string[]): HTMLElement {
  const container = host("");
  for (const [index, chunk] of chunks.entries()) {
    if (index === 0) container.innerHTML = withoutScripts(chunk);
    else container.insertAdjacentHTML("beforeend", withoutScripts(chunk));
    for (const source of scriptsOf(chunk)) if (source.trim() !== "") (0, eval)(source);
  }
  return container;
}

async function quiet(): Promise<void> {
  const core = await import("@barqjs/core");
  for (let turn = 0; turn < 6; turn++) {
    await new Promise((done) => setTimeout(done, 0));
    core.flush();
  }
}

async function hydrated(dom: Module, container: HTMLElement) {
  const core = await import("@barqjs/core");
  core.resetChildIds();
  const dispose = core.hydrate(dom.default as never, container);
  const claimed = container.textContent;
  const report = core.hydrate.report;
  return { dispose, claimed, report };
}

function reset(): void {
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
}

const DEFERRED = (defer: boolean) => `
function Profile() {
  const name = createMemo(async () => {
    counts.fetches++
    await later()
    return "salama"
  }${defer ? ", { deferStream: true }" : ""})
  return <b>{name()}</b>
}
export default function Page() {
  return <main><Loading fallback={<i>wait</i>}><Profile /></Loading></main>
}`;

test("deferStream holds the shell for the memo, so its boundary ships content instead of a fallback", async () => {
  reset();
  const held = await compiled(DEFERRED(true));
  const plain = await compiled(DEFERRED(false));

  const heldStream = await streamed(held.ssr);
  const plainStream = await streamed(plain.ssr);

  expect(heldStream.chunks[0]).toContain("<b>salama</b>");
  expect(heldStream.chunks[0]).not.toContain("<i>wait</i>");
  expect(heldStream.chunks.join("")).not.toContain("__BARQ_SWAP__(");
  expect(plainStream.chunks[0]).toContain("<i>wait</i>");
  expect(plainStream.chunks.join("")).toContain("__BARQ_SWAP__(");

  const container = assembled(heldStream.chunks);
  const served = container.querySelector("b");
  const { dispose, claimed, report } = await hydrated(held.dom, container);
  await quiet();

  expect(claimed).toBe("salama");
  expect(report.recovered).toBe(false);
  expect(report.mismatches).toEqual([]);
  expect(container.querySelector("b")).toBe(served);
  expect(held.ssr.counts.fetches).toBe(1);
  expect(held.dom.counts.fetches).toBe(0);
  dispose();
  container.remove();
  reset();
});

test('ssrSource "client" with a loadingValue: the server renders the declared value and never runs the compute', async () => {
  reset();
  const page = await compiled(`
function Draft() {
  const draft = createMemo(async () => {
    counts.fetches++
    await later()
    return "from the browser"
  }, { ssrSource: "client", loadingValue: "draft-0" })
  return <p>{draft()}</p>
}
export default function Page() {
  return <main><Draft /></main>
}`);
  const { chunks, deadlines } = await streamed(page.ssr);
  const container = assembled(chunks);
  const served = container.querySelector("p");

  expect(page.ssr.counts.fetches).toBe(0);
  expect(container.textContent).toBe("draft-0");
  expect(deadlines).toEqual([]);

  const { dispose, claimed, report } = await hydrated(page.dom, container);
  expect(claimed).toBe("draft-0");
  expect(page.dom.counts.fetches).toBe(0);
  await quiet();

  expect(report.recovered).toBe(false);
  expect(report.mismatches).toEqual([]);
  expect(container.querySelector("p")).toBe(served);
  expect(container.textContent).toBe("from the browser");
  expect(page.dom.counts.fetches).toBe(1);
  dispose();
  container.remove();
  reset();
});

test('a bare ssrSource "client" memo leaves its boundary to the browser without holding the stream', async () => {
  reset();
  const page = await compiled(`
function Widget() {
  const width = createMemo(async () => {
    counts.fetches++
    return "measured"
  }, { ssrSource: "client" })
  return <b>{width()}</b>
}
export default function Page() {
  return <main><p>before</p><Loading fallback={<i>wait</i>}><Widget /></Loading></main>
}`);
  const { chunks, deadlines } = await streamed(page.ssr);
  const container = assembled(chunks);

  expect(page.ssr.counts.fetches).toBe(0);
  expect(container.textContent).toBe("beforewait");
  expect(deadlines).toEqual([]);

  const { dispose, claimed, report } = await hydrated(page.dom, container);
  expect(claimed).toBe("beforewait");
  await quiet();

  expect(report.recovered).toBe(false);
  expect(report.mismatches).toEqual([]);
  expect(container.textContent).toBe("beforemeasured");
  expect(page.dom.counts.fetches).toBe(1);
  dispose();
  container.remove();
  reset();
});

test('ssrSource "hybrid" continues a stream in the browser from the value the server sent', async () => {
  reset();
  const page = await compiled(`
function Ticker() {
  const tick = createMemo(async function* () {
    counts.fetches++
    yield "tick-1"
    await later()
    yield "tick-2"
  }, { ssrSource: "hybrid" })
  return <b>{tick()}</b>
}
export default function Page() {
  return <main><Loading fallback={<i>wait</i>}><Ticker /></Loading></main>
}`);
  const { chunks } = await streamed(page.ssr);
  const container = assembled(chunks);
  expect(container.textContent).toBe("tick-1");

  const { dispose, claimed, report } = await hydrated(page.dom, container);
  expect(claimed).toBe("tick-1");
  expect(page.dom.counts.fetches).toBe(0);
  await quiet();

  expect(report.recovered).toBe(false);
  expect(report.mismatches).toEqual([]);
  expect(page.dom.counts.fetches).toBe(1);
  expect(container.textContent).toBe("tick-2");
  dispose();
  container.remove();
  reset();
});

test('ssrSource "hybrid" over a promise adopts the server value and does not fetch again', async () => {
  reset();
  const page = await compiled(`
function Once() {
  const value = createMemo(async () => {
    counts.fetches++
    await later()
    return "fetched once"
  }, { ssrSource: "hybrid" })
  return <b>{value()}</b>
}
export default function Page() {
  return <main><Loading fallback={<i>wait</i>}><Once /></Loading></main>
}`);
  const { chunks } = await streamed(page.ssr);
  const container = assembled(chunks);
  const { dispose, report } = await hydrated(page.dom, container);
  await quiet();

  expect(report.recovered).toBe(false);
  expect(container.textContent).toBe("fetched once");
  expect(page.ssr.counts.fetches).toBe(1);
  expect(page.dom.counts.fetches).toBe(0);
  dispose();
  container.remove();
  reset();
});

test("the default source adopts a streamed value and does not run the generator again", async () => {
  reset();
  const page = await compiled(`
function Ticker() {
  const tick = createMemo(async function* () {
    counts.fetches++
    yield "tick-1"
    await later()
    yield "tick-2"
  })
  return <b>{tick()}</b>
}
export default function Page() {
  return <main><Loading fallback={<i>wait</i>}><Ticker /></Loading></main>
}`);
  const { chunks } = await streamed(page.ssr);
  const container = assembled(chunks);
  const { dispose } = await hydrated(page.dom, container);
  await quiet();

  expect(container.textContent).toBe("tick-1");
  expect(page.dom.counts.fetches).toBe(0);
  dispose();
  container.remove();
  reset();
});
