/**
 * Hydration: the client has to agree with the server about the IDS.
 *
 * `ssr.test.ts` proves the string backend writes correct markup. This proves
 * the other half — that a client hydrating that markup derives the same ids,
 * so `aria-labelledby` and `aria-describedby` still point at the elements they
 * named. An id the client renumbers is an accessible name that silently
 * disappears, and no markup comparison catches it: both sides are internally
 * consistent, they just disagree with each other.
 *
 * ONE fixture, compiled TWICE. A barq module is compiled for one side, and a
 * test process compiles once, so the two halves are produced here by hand:
 * `bothBackends` runs the real compiler over the same source with `ssr: true`
 * and without it, writes both to disk and imports them. A hand-written
 * approximation of either backend would be testing this file's memory of the
 * backend rather than the backend.
 *
 * The fixture uses HOOKS rather than this package's components, and that is a
 * real limit rather than a preference: a component's own module is compiled
 * for one backend too, so a `<Checkbox>` reached from the server half would be
 * the DOM-compiled one, which builds nodes the string backend cannot use. The
 * hooks are where the ids are decided, so they are what is worth pinning.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { renderAndHydrate } from "@barqjs/testing";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const CORE = new URL("../node_modules/@barqjs/core/src/index.ts", import.meta.url).pathname;
const SERVER = new URL("../node_modules/@barqjs/server/src/index.ts", import.meta.url).pathname;

// Inside the package, not the system temp directory: a fixture imports
// `@barqjs/primitives`, and resolution walks up from where the file IS.
const OUT = join(SRC, "..", "node_modules", ".barq-hydration-fixtures");
mkdirSync(OUT, { recursive: true });
let sequence = 0;

interface Halves<T> {
  /** Compiled by the string backend. */
  server: T;
  /** Compiled by the DOM backend, to claim what the server wrote. */
  client: T;
}

/**
 * One source, compiled for both backends and loaded.
 *
 * Written as `.ts` rather than `.tsx`: the suite's own loader plugin claims
 * every `.tsx` and would compile them a second time, for the DOM.
 */
async function bothBackends<T>(source: string): Promise<Halves<T>> {
  const at = sequence++;
  const common = {
    filename: join(OUT, `fixture-${at}.tsx`),
    moduleSource: CORE,
    serverSource: SERVER,
  };

  const serverFile = join(OUT, `server-${at}.ts`);
  writeFileSync(serverFile, native.transform(source, { ...common, ssr: true }).code);

  const clientFile = join(OUT, `client-${at}.ts`);
  writeFileSync(clientFile, native.transform(source, common).code);

  return {
    server: (await import(serverFile)) as T,
    client: (await import(clientFile)) as T,
  };
}

type Half = { App: (scope: null, props: unknown) => unknown };

const FIELD = `
  import { field } from "${SRC}/label.ts";

  export function App() {
    const { labelProps, fieldProps, descriptionProps, errorMessageProps } = field({
      label: "Email",
      description: "We will not share it",
      errorMessage: "Not an email address",
      isInvalid: true,
    });
    return (
      <div>
        <label {...labelProps}>Email</label>
        <input {...fieldProps} />
        <span {...descriptionProps}>We will not share it</span>
        <span {...errorMessageProps}>Not an email address</span>
      </div>
    );
  }
`;

const LISTBOX = `
  import { listState } from "${SRC}/collections.ts";
  import { listBox, option, optionIdFor } from "${SRC}/listbox.tsx";
  import { ref } from "@barqjs/primitives/refs";

  const FRUITS = [
    { id: "apple", name: "Apple" },
    { id: "banana", name: "Banana" },
  ];

  export function App() {
    const listRef = ref();
    const state = listState({
      items: FRUITS,
      selectionMode: "single",
      getTextValue: (fruit) => fruit.name,
    });
    const { listBoxProps, labelProps, baseId } = listBox(
      { ref: listRef, label: "Fruit", shouldUseVirtualFocus: true },
      state,
    );
    return (
      <div>
        <span {...labelProps}>Fruit</span>
        <ul {...listBoxProps}>
          <li id={optionIdFor(baseId(), "apple")} role="option">Apple</li>
          <li id={optionIdFor(baseId(), "banana")} role="option">Banana</li>
        </ul>
      </div>
    );
  }
`;

function idsIn(html: string): string[] {
  return [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1] as string);
}

/**
 * Markup with every id replaced by its position in first-appearance order.
 *
 * The ids themselves cannot be compared across the two renders, and the reason
 * is the harness rather than the code: `id()` numbers from the owner's place in
 * the scope tree, and a browser hydrates into a fresh process where the client
 * is the first thing mounted. Here the server render mounted first, so the
 * client is at a different position and every string differs — while meaning
 * exactly the same thing.
 *
 * What must survive is the GRAPH: the same elements carry an id, and every
 * reference still points at the same one. Normalising to `#0`, `#1`, … and
 * comparing the markup checks precisely that, and catches the failure that
 * matters — a client that renumbers an element without renumbering what names
 * it, leaving an `aria-labelledby` pointing at nothing.
 */
function normaliseIds(html: string): string {
  const seen = new Map<string, string>();
  const number = (id: string): string => {
    let known = seen.get(id);
    if (known === undefined) {
      known = `#${seen.size}`;
      seen.set(id, known);
    }
    return known;
  };

  return html.replaceAll(
    /\b(id|for|data-collection|aria-labelledby|aria-describedby|aria-controls|aria-activedescendant)="([^"]*)"/g,
    (_match, attribute: string, value: string) =>
      `${attribute}="${value.split(/\s+/).filter(Boolean).map(number).join(" ")}"`,
  );
}

function referencesIn(html: string): string[] {
  return [...html.matchAll(/aria-(?:labelledby|describedby|controls|activedescendant)="([^"]+)"/g)]
    .flatMap((match) => (match[1] as string).split(/\s+/))
    .filter((id) => id !== "");
}

async function hydrated(source: string): Promise<ReturnType<typeof renderAndHydrate>> {
  const { server, client } = await bothBackends<Half>(source);
  return renderAndHydrate({
    server: () => server.App(null, {}) as never,
    client: (() => client.App(null, {})) as never,
  });
}

describe("a labelled field", () => {
  test("the client claims the server's markup rather than rebuilding it", async () => {
    const result = await hydrated(FIELD);

    expect(result.claimed, "the walk claimed nothing, so it rebuilt the page").toBeGreaterThan(0);
    expect(result.recovered, "the walk gave up and re-rendered").toBe(false);
    expect(result.mismatches).toEqual([]);
    result.unmount();
  });

  test("the server's own nodes are still in the tree, by reference", async () => {
    const result = await hydrated(FIELD);

    // By REFERENCE, which is the only measure that distinguishes hydration
    // from a rebuild that happens to produce the same markup.
    expect(result.reuse).toBe(1);
    result.unmount();
  });

  test("the id graph the client derived is the one the server wrote", async () => {
    const result = await hydrated(FIELD);

    expect(idsIn(result.html).length, "the fixture writes no ids").toBeGreaterThan(0);
    expect(normaliseIds(result.container.innerHTML)).toBe(normaliseIds(result.html));
    result.unmount();
  });

  test("every aria reference still points at an element that exists", async () => {
    const result = await hydrated(FIELD);

    const html = result.container.innerHTML;
    const ids = new Set(idsIn(html));
    const references = referencesIn(html);

    expect(
      references.length,
      "the fixture references nothing, so this proves nothing",
    ).toBeGreaterThan(0);
    expect(
      references.filter((id) => !ids.has(id)),
      "these references point at nothing after hydration",
    ).toEqual([]);
    result.unmount();
  });
});

describe("a listbox", () => {
  test("hydrates, and the option ids keep their relationships", async () => {
    const result = await hydrated(LISTBOX);

    expect(result.recovered).toBe(false);
    expect(result.reuse).toBe(1);
    expect(
      normaliseIds(result.container.innerHTML),
      "an option id moved, so `aria-activedescendant` would name nothing",
    ).toBe(normaliseIds(result.html));
    result.unmount();
  });

  test("the label still names the list after hydration", async () => {
    const result = await hydrated(LISTBOX);

    const list = result.container.querySelector("ul") as HTMLElement | null;
    const label = result.container.querySelector("span");
    expect(list?.getAttribute("aria-labelledby")).toBe(label?.id ?? "");
    result.unmount();
  });
});
