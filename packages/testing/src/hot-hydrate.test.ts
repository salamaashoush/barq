/**
 * A development client hands every component out through `hot`, and a page it
 * hydrates is one the server wrote without it. Wherever a component stands,
 * the client must claim exactly the nodes a client without the proxy claims,
 * and an edit to the component must still rebuild that instance in place.
 *
 * Each source is compiled the way the development server compiles it: the
 * string backend for the server, and a hydratable development compile for the
 * client with the hot wrap appended to each component declaration.
 */

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { flush } from "@barqjs/core";
import { type HotContext, hot } from "@barqjs/core/hot";
import { render } from "@barqjs/web";

import { renderAndHydrate } from "./hydrate.ts";

const require_ = createRequire(import.meta.url);
interface NativeCompiler {
  transform(code: string, options?: Record<string, unknown>): TransformOutput;
}

interface TransformOutput {
  code: string;
}

const native = require_("@barqjs/compiler") as NativeCompiler;

const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
// Inside the package, so the fixtures resolve `@barqjs/*` as this suite does.
const OUT = join(SRC, "..", "node_modules", ".barq-hot-hydrate-fixtures");
mkdirSync(OUT, { recursive: true });
let sequence = 0;

type Component = (props: Record<string, unknown>) => unknown;
type Module = Record<string, Component> & { readonly __barq_context: HotContext };

/**
 * What the development server appends to each component declaration (see
 * `withHotComponents` in `@barqjs/vite`), with a context the test holds
 * standing in for `import.meta.hot`.
 */
function withHot(code: string, components: readonly string[]): string {
  const rebound = components
    .map((name) => `${name} = __barq_hot(__barq_context, ${JSON.stringify(name)}, ${name});`)
    .join("\n");
  return (
    `import { hot as __barq_hot } from "@barqjs/core/hot";\n` +
    `export const __barq_context = { data: {} };\n${code}\n${rebound}\n`
  );
}

interface CompiledModules {
  client: Module;
  plain: Module;
  server: Module;
}

async function compile(source: string, components: readonly string[]): Promise<CompiledModules> {
  const at = sequence++;
  const common = {
    filename: join(OUT, `fixture-${at}.tsx`),
    moduleSource: "@barqjs/web",
    coreSource: "@barqjs/core",
    serverSource: "@barqjs/server",
    hydratable: true,
    dev: true,
  };
  // `.ts`, so the suite's own loader does not compile them a second time.
  const serverFile = join(OUT, `server-${at}.ts`);
  writeFileSync(serverFile, native.transform(source, { ...common, ssr: true }).code);
  const client = native.transform(source, common).code;
  const clientFile = join(OUT, `client-${at}.ts`);
  writeFileSync(clientFile, withHot(client, components));
  const plainFile = join(OUT, `plain-${at}.ts`);
  writeFileSync(plainFile, client);
  return {
    server: (await import(serverFile)) as Module,
    client: (await import(clientFile)) as Module,
    plain: (await import(plainFile)) as Module,
  };
}

const unmounts: (() => void)[] = [];

afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  document.body.textContent = "";
});

/**
 * One fixture per position a component can stand in. `Leaf` is the component
 * every test edits, `Other` a sibling that must keep its nodes, and each
 * position's own component holds a piece of state (`clicks`) an edit to `Leaf`
 * must leave alone. `runs` counts every body that ran, so a rebuild of
 * anything other than `Leaf` shows.
 */
const SOURCE = `
  import { For, Show, createSignal } from "@barqjs/core";

  export const runs = {};
  const ran = (name) => { runs[name] = (runs[name] ?? 0) + 1; };

  function counter(name) {
    ran(name);
    const [clicks, setClicks] = createSignal(0);
    return <b onClick={() => setClicks(clicks() + 1)}>{clicks()}</b>;
  }

  export function Leaf(props) {
    ran("Leaf");
    return <section>{"leaf " + (props.n ?? "salama")}</section>;
  }

  export function Edited(props) {
    ran("Edited");
    return <article>{"edited " + (props.n ?? "salama")}</article>;
  }

  function Other() {
    ran("Other");
    return <i>other</i>;
  }

  function PassThrough(props) {
    ran("PassThrough");
    return <>{props.children}</>;
  }

  function Wrap() {
    ran("Wrap");
    return <Leaf />;
  }

  export function Sole() {
    return <main>{counter("Sole")}<div><Leaf /></div></main>;
  }

  export function Several() {
    return <main>{counter("Several")}<Leaf /><Other /></main>;
  }

  export function BesideText() {
    return <main>{counter("BesideText")}text <Leaf /> more<Other /></main>;
  }

  function Pair() {
    ran("Pair");
    return <><Leaf /><Other /></>;
  }

  export function Fragment() {
    return <main>{counter("Fragment")}<Pair /></main>;
  }

  export function RootFragment() {
    ran("RootFragment");
    return <><Leaf /><Other /></>;
  }

  export function Returned() {
    return <main>{counter("Returned")}<Wrap /><Other /></main>;
  }

  export function Conditional() {
    return <main>{counter("Conditional")}<Show when={true}><Leaf /></Show><Other /></main>;
  }

  export function Rows() {
    return (
      <main>
        {counter("Rows")}
        <For each={[1, 2]}>{(n) => <Leaf n={n} />}</For>
        <Other />
      </main>
    );
  }

  export function HandedThrough() {
    return <main>{counter("HandedThrough")}<PassThrough><Leaf /></PassThrough><Other /></main>;
  }

  export function Root() {
    return <Leaf />;
  }

  export function SolePair() {
    return <main>{counter("SolePair")}<div><Pair /></div></main>;
  }

  export function ConditionalPair() {
    return <main>{counter("ConditionalPair")}<Show when={true}><Pair /></Show><Other /></main>;
  }

  export function RowsPair() {
    return <main>{counter("RowsPair")}<For each={[1, 2]}>{() => <Pair />}</For><Other /></main>;
  }

  export function HandedPair() {
    return <main>{counter("HandedPair")}<PassThrough><Pair /></PassThrough><Other /></main>;
  }
`;

const HOT = [
  "Leaf",
  "Other",
  "PassThrough",
  "Wrap",
  "Pair",
  "Sole",
  "Several",
  "BesideText",
  "Fragment",
  "RootFragment",
  "Returned",
  "Conditional",
  "Rows",
  "HandedThrough",
  "Root",
  "SolePair",
  "ConditionalPair",
  "RowsPair",
  "HandedPair",
];

/** The positions, and how many `Leaf` instances each one places. */
const POSITIONS: Record<string, number> = {
  Sole: 1,
  Several: 1,
  BesideText: 1,
  Fragment: 1,
  RootFragment: 1,
  Returned: 1,
  Conditional: 1,
  Rows: 2,
  HandedThrough: 1,
  Root: 1,
  Leaf: 1,
  SolePair: 1,
  ConditionalPair: 1,
  RowsPair: 2,
  HandedPair: 1,
};

const loaded = compile(SOURCE, HOT);

/**
 * Hydrate `name`, failing on anything the walk printed: a development build
 * prints a mismatch as well as reporting it.
 */
function hydrated(server: Module, client: Module, name: string) {
  const warn = spyOn(console, "warn");
  const error = spyOn(console, "error");
  try {
    const result = renderAndHydrate({
      server: () => server[name]({}) as never,
      client: (() => client[name]({})) as never,
    });
    unmounts.push(result.unmount);
    const printed = [...warn.mock.calls, ...error.mock.calls].map((call) => String(call[0]));
    return { result, printed };
  } finally {
    warn.mockRestore();
    error.mockRestore();
  }
}

/**
 * Every node under `container`, comments included, except an empty text node:
 * the edge a Cell in an array or a row stands on, which the proxy's Cell is
 * given as any other Cell there is, and which is made rather than claimed.
 */
function shape(container: Node): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === 3 && node.nodeValue === "") continue;
    out.push(node.nodeType === 1 ? node.nodeName : `${node.nodeType}:${node.nodeValue}`);
  }
  return out;
}

describe("a hot component hydrates the server's nodes wherever it stands", () => {
  for (const name of Object.keys(POSITIONS)) {
    test(name, async () => {
      const { client, plain, server } = await loaded;
      const { result, printed } = hydrated(server, client, name);
      expect(printed).toEqual([]);
      expect(result.mismatches).toEqual([]);
      expect(result.recovered).toBe(false);
      expect(result.kept).toBe(result.total);
      expect(result.container.innerHTML).toBe(result.html);
      // Exactly what a client without the proxy claims and leaves.
      const without = hydrated(server, plain, name);
      expect(without.result.mismatches).toEqual([]);
      expect(result.claimed).toBe(without.result.claimed);
      expect(shape(result.container)).toEqual(shape(without.result.container));
    });
  }
});

/** Everything in `container`, elements and text, in document order. */
function nodes(container: Node): Node[] {
  const out: Node[] = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) out.push(walker.currentNode);
  return out;
}

function shown(container: Element): string {
  return [...container.querySelectorAll("section, article")]
    .map((node) => node.textContent)
    .join("|");
}

/**
 * Edit `Leaf` to `Edited` while `name` is on screen, the way a module that is
 * evaluated again does, and check what moved.
 */
function replaced(client: Module, container: HTMLElement, name: string): void {
  const count = POSITIONS[name];
  const runs = client.runs as unknown as Record<string, number>;
  const clicks = container.querySelector("b");
  clicks?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  flush();
  if (clicks !== null) expect(clicks.textContent).toBe("1");

  const leaves = [...container.querySelectorAll("section")];
  expect(leaves).toHaveLength(count);
  const kept = nodes(container).filter(
    (node) => !leaves.some((leaf) => leaf === node || leaf.contains(node)),
  );
  const following = leaves.map((leaf) => leaf.nextSibling);
  const before = { ...runs };

  hot(client.__barq_context, "Leaf", client.Edited as never);
  flush();

  expect(container.querySelectorAll("section")).toHaveLength(0);
  const articles = [...container.querySelectorAll("article")];
  expect(articles).toHaveLength(count);
  // In place: where each `Leaf` stood, and every other node the one it was.
  const after = nodes(container).filter(
    (node) => !articles.some((article) => article === node || article.contains(node)),
  );
  expect(after).toEqual(kept);
  expect(articles.map((article) => article.nextSibling)).toEqual(following);
  for (const article of articles) expect(after).not.toContain(article);
  expect(runs.Edited ?? 0).toBe((before.Edited ?? 0) + count);
  for (const [body, times] of Object.entries(before)) {
    if (body !== "Edited") expect(runs[body], body).toBe(times);
  }
  if (clicks !== null) {
    expect(container.contains(clicks)).toBe(true);
    expect(clicks.textContent).toBe("1");
    clicks.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    flush();
    expect(clicks.textContent).toBe("2");
  }
}

describe("an edit rebuilds a hot component in place wherever it stands", () => {
  for (const name of Object.keys(POSITIONS)) {
    test(`${name}, hydrated`, async () => {
      const { client, server } = await compile(SOURCE, HOT);
      const { result } = hydrated(server, client, name);
      expect(result.mismatches).toEqual([]);
      const order = shown(result.container);
      replaced(client, result.container, name);
      expect(shown(result.container)).toBe(order.replaceAll("leaf", "edited"));
    });

    test(`${name}, rendered`, async () => {
      const { client } = await compile(SOURCE, HOT);
      const container = document.body.appendChild(document.createElement("div"));
      unmounts.push(render((() => client[name]({})) as never, container));
      flush();
      const order = shown(container);
      replaced(client, container, name);
      expect(shown(container)).toBe(order.replaceAll("leaf", "edited"));
    });
  }
});
