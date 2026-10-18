/**
 * The universal target against the document, fixture by fixture.
 *
 * Every fixture is compiled for `target: "universal"` with the in-memory host
 * of `@barqjs/universal`'s suite as its renderer, rendered there, and driven
 * through its scripted steps. The tree it builds after each frame must be the
 * tree the DOM backend builds in happy-dom, read as tags, properties and text:
 * the two backends lower one IR, so a construct one of them builds differently
 * is a bug in that backend.
 *
 * Two kinds of fixture are required to differ instead, and each fails here
 * if it stops differing. One whose DOM compile binds a form control (`bind:`)
 * or a form's `action` must be reported as BARQ027 by the universal compile.
 * One whose own code calls the document's node API, in a ref or through a
 * selector, compiles cleanly and must fail on the host at that call: the
 * compiler cannot see a method call on a node, and a host node has none.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { classToString } from "@barqjs/web";
import { styleToString } from "@barqjs/web/internal";
import {
  compileFixture,
  compileSourceRaw,
  fixtureSource,
  haltsHeld,
  listFixtures,
  loadModule,
  settle,
  type FixtureModule,
} from "./harness.ts";
import { TEXT, type TestNode } from "../../universal/src/test-host.ts";

const RENDERER = join(import.meta.dir, "universal-renderer.ts");

interface Raw {
  code: string;
  diagnostics: Array<{ code: string; message: string }>;
}

/** The fixture's source with its renderer imports pointed at the custom renderer. */
function universalSource(name: string): string {
  return fixtureSource(name).replaceAll('from "@barqjs/web"', `from ${JSON.stringify(RENDERER)}`);
}

function compileUniversal(name: string): Raw {
  return compileSourceRaw(universalSource(name), `${name}.tsx`, {
    target: "universal",
    moduleSource: RENDERER,
  }) as unknown as Raw;
}

// ---------------------------------------------------------------------------
// one tree shape for both
// ---------------------------------------------------------------------------

type Shape = string;

/** Adjacent text fused, empty text and comments dropped, attributes sorted. */
function shapeOf(children: Array<{ text: string } | { element: Shape }>): Shape {
  let out = "";
  let run = "";
  const flush = (): void => {
    // Source indentation between tags, which the two builds keep or drop by
    // where a hole sits rather than by what they render.
    if (run !== "" && !(run.trim() === "" && run.includes("\n"))) out += JSON.stringify(run);
    run = "";
  };
  for (const child of children) {
    if ("text" in child) {
      run += child.text;
      continue;
    }
    flush();
    out += child.element;
  }
  flush();
  return out;
}

/**
 * Names compared without case or hyphens: the document lowercases an HTML
 * attribute and kebab-cases an SVG one (`strokeWidth` is `stroke-width`),
 * where a custom host is handed the author's spelling.
 */
function element(tag: string, attributes: Map<string, string>, inner: Shape): Shape {
  attributes = new Map(
    [...attributes].map(([name, value]) => [name.toLowerCase().replaceAll("-", ""), value]),
  );
  const names = [...attributes.keys()].toSorted();
  const attrs = names.map((name) => ` ${name}=${JSON.stringify(attributes.get(name))}`).join("");
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function classes(value: string): string {
  return [...new Set(value.split(/\s+/).filter(Boolean))].toSorted().join(" ");
}

function declarations(value: string): string {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(":");
      return `${part.slice(0, colon).trim()}:${part.slice(colon + 1).trim()}`;
    })
    .toSorted()
    .join(";");
}

/**
 * The properties a form control holds as state rather than as an attribute.
 * A `<textarea>`'s value is its text, and a checkbox's is `"on"` until one is
 * written, so neither is read as one.
 */
function liveProps(node: Element): readonly string[] {
  if (node.localName === "option") return ["selected"];
  if (node.localName !== "input") return [];
  const type = (node as HTMLInputElement).type;
  return type === "checkbox" || type === "radio" ? ["checked"] : ["value", "checked"];
}

/**
 * happy-dom does not eat the newline that follows `<pre>`, `<textarea>` and
 * `<listing>`, so the newline the compiler doubles for a template survives in
 * the document and a host that is handed the text has one fewer. A conforming
 * parser eats it; the leading run is read as one newline on both sides.
 */
const NEWLINE_EATING = new Set(["pre", "textarea", "listing"]);

function leading(tag: string, children: Array<{ text: string } | { element: Shape }>): void {
  if (!NEWLINE_EATING.has(tag)) return;
  const first = children[0];
  if (first === undefined || !("text" in first)) return;
  first.text = first.text.replace(/^\n+/, "\n");
}

function domShape(node: Node): Shape {
  const children: Array<{ text: string } | { element: Shape }> = [];
  // A `<template>`'s children are parsed into its content, and a host built
  // them as children.
  const holder = node instanceof HTMLTemplateElement ? node.content : node;
  for (const child of holder.childNodes) {
    if (child.nodeType === 3) children.push({ text: (child as Text).data });
    else if (child.nodeType === 1) children.push({ element: domElement(child as Element) });
  }
  if (node.nodeType === 1) leading((node as Element).localName, children);
  return shapeOf(children);
}

function domElement(node: Element): Shape {
  const attributes = new Map<string, string>();
  for (const attribute of node.attributes) {
    const value =
      attribute.name === "class"
        ? classes(attribute.value)
        : attribute.name === "style"
          ? declarations(attribute.value)
          : attribute.value;
    attributes.set(attribute.name, value);
  }
  // A `<textarea>` written through its property holds a value its text does
  // not show.
  if (node instanceof HTMLTextAreaElement && node.value !== node.textContent) {
    attributes.set("value", node.value);
  }
  for (const name of liveProps(node)) {
    if (!(name in node)) continue;
    const value = (node as unknown as Record<string, unknown>)[name];
    if (typeof value === "boolean") {
      if (value) attributes.set(name, "");
      else attributes.delete(name);
    } else if (typeof value === "string" && (value !== "" || attributes.has(name))) {
      attributes.set(name, value);
    }
  }
  return element(node.localName, attributes, domShape(node));
}

/**
 * A property's value as the attribute the document would show for it, by the
 * document renderer's own conversions. A function is a handler or a ref and
 * shows as nothing, as an event listener does.
 */
function attributeOf(name: string, value: unknown): string | null {
  if (typeof value === "function" || value === null || value === undefined || value === false) {
    return null;
  }
  // A handler, or a `[handler, data]` pair, which the document binds as a
  // listener rather than writing.
  if (name.startsWith("on") && Array.isArray(value) && typeof value[0] === "function") return null;
  if (name === "class" || name === "className") {
    const text = classToString(value);
    return text === null ? null : classes(text);
  }
  if (name === "style") {
    const text = styleToString(value);
    return text === null ? null : declarations(text);
  }
  if (value === true) return "";
  return String(value);
}

function hostShape(node: TestNode): Shape {
  const children: Array<{ text: string } | { element: Shape }> = [];
  for (const child of node.children) {
    if (child.tag === TEXT) children.push({ text: child.text });
    else children.push({ element: hostElement(child) });
  }
  leading(node.tag, children);
  return shapeOf(children);
}

function hostElement(node: TestNode): Shape {
  const attributes = new Map<string, string>();
  let inner = hostShape(node);
  for (const [name, value] of Object.entries(node.props)) {
    // The document writes the markup first and appends the children after it.
    if (name === "innerHTML" || name === "dangerouslySetInnerHTML") {
      const markup = name === "innerHTML" ? value : (value as { __html?: unknown } | null)?.__html;
      const parsed = document.createElement("template");
      parsed.innerHTML = typeof markup === "string" ? markup : "";
      inner = domShape(parsed.content) + inner;
      continue;
    }
    if (name === "textContent") {
      inner = shapeOf([{ text: typeof value === "string" ? value : "" }]);
      continue;
    }
    const text = attributeOf(name === "className" ? "class" : name, value);
    if (text !== null) attributes.set(name === "className" ? "class" : name, text);
  }
  return element(node.tag, attributes, inner);
}

// ---------------------------------------------------------------------------
// the two renders
// ---------------------------------------------------------------------------

async function frames(
  mod: FixtureModule,
  mount: () => () => void,
  read: () => Shape,
): Promise<Shape[]> {
  const core = await import("@barqjs/core");
  core.resetErrorHalt();
  let unmount: () => void = () => {};
  let dispose: () => void = () => {};
  try {
    core.runWithOwner(null, () =>
      core.createRoot((done: () => void) => {
        dispose = done;
        unmount = mount();
      }),
    );
    await settle();
    const out = [read()];
    for (const step of mod.steps ?? []) {
      step();
      await settle();
      out.push(read());
    }
    return out;
  } finally {
    unmount();
    dispose();
  }
}

async function renderDom(name: string): Promise<Shape[]> {
  const web = await import("@barqjs/web");
  const mod = await loadModule(compileFixture(name), `universal-dom-${name}`);
  const container = document.createElement("div");
  document.body.appendChild(container);
  try {
    return await frames(
      mod,
      () => web.render(mod.default as never, container),
      // A portal mounts into the document's body by default and into the
      // render root on a custom host, so what the body holds after the
      // container is read as following it.
      () => {
        const portalled = [...document.body.childNodes].filter((node) => node !== container);
        const holders = portalled.flatMap((node) => [...node.childNodes]);
        const fragment = document.createDocumentFragment();
        for (const node of holders) fragment.appendChild(node.cloneNode(true));
        return domShape(container) + domShape(fragment);
      },
    );
  } finally {
    container.remove();
    document.body.innerHTML = "";
  }
}

async function renderHost(name: string, code: string): Promise<Shape[]> {
  const renderer = (await import(RENDERER)) as typeof import("./universal-renderer.ts");
  const mod = await loadModule(code, `universal-${name}`);
  const root = renderer.host.root("div");
  return frames(
    mod,
    () => renderer.render(mod.default as never, root),
    () => hostShape(root),
  );
}

// ---------------------------------------------------------------------------

/** Fixtures whose own code needs a document node, and the call that does. */
const DOCUMENT_CODE: Record<string, { calls: RegExp; why: string }> = {
  "attribute-namespaces": {
    calls: /addEventListener/,
    why: "its ref listens for a custom event on the element",
  },
  "class-owns-only-its-tokens": {
    calls: /classList/,
    why: "its ref adds a class token through the element's classList",
  },
  portal: {
    calls: /<Portal mount>` was given "#portal-target"/,
    why: "it mounts by CSS selector, which only the document can resolve",
  },
  "ref-binding": { calls: /setAttribute/, why: "its ref writes an attribute on the element" },
  "ref-cleanup": { calls: /addEventListener/, why: "its ref listens for an event on the element" },
  "ref-on-component": {
    calls: /setAttribute/,
    why: "it reads the ref'd element's className and writes an attribute on it",
  },
  "ref-writable-binding": {
    calls: /setAttribute/,
    why: "it reads the bound element's className and writes an attribute on it",
  },
};

const fixtures = listFixtures();

/** The fixtures whose DOM compile binds a form control or a form's `action`. */
const documentOnly = new Set(
  fixtures.filter((name) => /_\$+(bindValue|formAction)\(/.test(compileFixture(name))),
);

describe("the universal target", () => {
  test("is not vacuous: most of the corpus renders on the custom host", () => {
    expect(fixtures.length - documentOnly.size).toBeGreaterThan(120);
    expect(documentOnly.size).toBeGreaterThan(0);
  });

  test("every fixture said to need a document node exists", () => {
    expect(Object.keys(DOCUMENT_CODE).filter((name) => !fixtures.includes(name))).toEqual([]);
  });

  for (const name of fixtures) {
    const needs = DOCUMENT_CODE[name];
    if (needs !== undefined) {
      test(`${name}: compiles cleanly and fails on the host where ${needs.why}`, async () => {
        const raw = compileUniversal(name);
        expect(raw.diagnostics.filter((entry) => entry.code.startsWith("BARQ"))).toEqual([]);
        const failure = await haltsHeld(() => renderHost(name, raw.code)).then(
          () => null,
          (error: unknown) => (error instanceof Error ? error.message : String(error)),
        );
        expect(failure).toMatch(needs.calls);
      });
      continue;
    }
    if (documentOnly.has(name)) {
      test(`${name}: reports BARQ027 for the document-only binding`, () => {
        const raw = compileUniversal(name);
        expect(raw.diagnostics.map((entry) => entry.code)).toContain("BARQ027");
      });
      continue;
    }
    test(`${name}: builds the tree the DOM backend builds`, async () => {
      const raw = compileUniversal(name);
      expect(raw.diagnostics.filter((entry) => entry.code === "BARQ027")).toEqual([]);
      const [dom, universal] = await haltsHeld(async () => [
        await renderDom(name),
        await renderHost(name, raw.code),
      ]);
      expect(universal).toEqual(dom);
    });
  }
});
