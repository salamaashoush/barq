/**
 * The hooks through the STRING backend.
 *
 * Everything in this package that is not a component is backend-independent by
 * construction — a hook answers with a props object and never touches the DOM
 * — but "by construction" is an argument and this is a test. What it is really
 * checking is the identifiers: `id()` numbers from the owner's position in the
 * scope tree, so a label and the control it names have to agree on a string
 * that the server wrote and the client will compute again.
 *
 * The fixture is compiled by the real compiler with `ssr: true`, the way
 * `packages/benchmark` does it, because a hand-written approximation of what
 * the SSR backend emits measures this file's memory of the backend rather than
 * the backend.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { renderToString } from "@barqjs/server";

const require_ = createRequire(import.meta.url);
const native = require_("@barqjs/compiler-rs") as {
  transform(code: string, options?: Record<string, unknown>): { code: string };
};

const SRC = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const CORE = new URL("../node_modules/@barqjs/core/src/index.ts", import.meta.url).pathname;
const SERVER = new URL("../node_modules/@barqjs/server/src/index.ts", import.meta.url).pathname;

// Inside the package, not the system temp directory: a fixture imports
// `@barqjs/primitives`, and resolution walks up from where the file IS.
const OUT = join(SRC, "..", "node_modules", ".barq-ssr-fixtures");
mkdirSync(OUT, { recursive: true });
let sequence = 0;

/**
 * A fixture, compiled for the string backend and loaded.
 *
 * Written as `.ts` rather than `.tsx`: the suite's own loader plugin claims
 * every `.tsx`, and would compile this one a second time — for the DOM.
 */
async function ssrModule<T>(source: string): Promise<T> {
  const { code } = native.transform(source, {
    filename: join(OUT, `fixture-${sequence}.tsx`),
    ssr: true,
    moduleSource: CORE,
    serverSource: SERVER,
  });
  const file = join(OUT, `fixture-${sequence++}.ts`);
  writeFileSync(file, code);
  return (await import(file)) as T;
}

describe("a labelled field", () => {
  test("the label names the control, on the server", async () => {
    const mod = await ssrModule<{ Field: (s: null, props: unknown) => unknown }>(`
      import { field } from "${SRC}/label.ts";

      export function Field() {
        const { labelProps, fieldProps, descriptionProps } = field({
          label: "Email",
          description: "We will not share it",
        });
        return (
          <div>
            <label {...labelProps}>Email</label>
            <input {...fieldProps} />
            <span {...descriptionProps}>We will not share it</span>
          </div>
        );
      }
    `);

    const html = renderToString(() => mod.Field(null, {}) as never);

    const labelId = /<label[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    const describedBy = /<input[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    const descriptionId = /<span[^>]*\bid="([^"]+)"/.exec(html)?.[1];

    expect(labelId).toBeDefined();
    expect(html).toContain(`aria-labelledby="${labelId}"`);
    // The description is announced with the field, and the id it points at is
    // the one the description element was actually written with.
    expect(describedBy).toBe(descriptionId);
  });

  test("an invalid field says so and points at the message", async () => {
    const mod = await ssrModule<{ Field: (s: null, props: unknown) => unknown }>(`
      import { field } from "${SRC}/label.ts";

      export function Field() {
        const { fieldProps, errorMessageProps } = field({
          "aria-label": "Email",
          isInvalid: true,
          errorMessage: "Not an email address",
        });
        return (
          <div>
            <input {...fieldProps} />
            <span {...errorMessageProps}>Not an email address</span>
          </div>
        );
      }
    `);

    const html = renderToString(() => mod.Field(null, {}) as never);
    const errorId = /<span[^>]*\bid="([^"]+)"/.exec(html)?.[1];

    expect(errorId).toBeDefined();
    expect(html).toContain(`aria-describedby="${errorId}"`);
  });
});

describe("a listbox", () => {
  test("the roles and the selection are in the markup, not added on the client", async () => {
    const mod = await ssrModule<{ List: (s: null, props: unknown) => unknown }>(`
      import { listState } from "${SRC}/collections.ts";
      import { listBox, option, optionIdFor } from "${SRC}/listbox.tsx";
      import { ref } from "@barqjs/primitives/refs";

      const FRUITS = [
        { id: "apple", name: "Apple" },
        { id: "banana", name: "Banana" },
      ];

      export function List() {
        const listRef = ref();
        const state = listState({
          items: FRUITS,
          selectionMode: "single",
          defaultSelectedKeys: ["banana"],
          getTextValue: (fruit) => fruit.name,
        });
        const { listBoxProps, baseId } = listBox({ ref: listRef, "aria-label": "Fruit" }, state);

        return (
          <ul {...listBoxProps}>
            {[...state.collection()].map((node) => {
              const itemRef = ref();
              const { optionProps } = option({ key: node.key, ref: itemRef, baseId }, state);
              return <li {...optionProps}>{node.textValue}</li>;
            })}
          </ul>
        );
      }
    `);

    const html = renderToString(() => mod.List(null, {}) as never);

    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Fruit"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
    // Selection is server state, not a client afterthought: a page that
    // rendered every option unselected would flash the wrong one.
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-selected="false"');
  });

  test("an option's id is derived, so anything can name it before it exists", async () => {
    const mod = await ssrModule<{ List: (s: null, props: unknown) => unknown }>(`
      import { listState } from "${SRC}/collections.ts";
      import { listBox, option, optionIdFor } from "${SRC}/listbox.tsx";
      import { ref } from "@barqjs/primitives/refs";

      export function List() {
        const listRef = ref();
        const state = listState({ items: [{ id: "apple", name: "Apple" }], selectionMode: "single" });
        const { listBoxProps, baseId } = listBox({ ref: listRef, "aria-label": "Fruit" }, state);
        const itemRef = ref();
        const { optionProps } = option({ key: "apple", ref: itemRef, baseId }, state);

        return (
          <div>
            <ul {...listBoxProps}>
              <li {...optionProps}>Apple</li>
            </ul>
            <span data-derived={optionIdFor(baseId(), "apple")} />
          </div>
        );
      }
    `);

    const html = renderToString(() => mod.List(null, {}) as never);

    const optionId = /<li[^>]*\bid="([^"]+)"/.exec(html)?.[1];
    const derived = /data-derived="([^"]+)"/.exec(html)?.[1];

    expect(optionId).toBeDefined();
    // The same string, worked out from the key rather than handed round: this
    // is what lets a combo box's input name an option it has not rendered.
    expect(derived).toBe(optionId);
  });
});
