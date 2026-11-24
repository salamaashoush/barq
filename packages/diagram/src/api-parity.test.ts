/**
 * Every export of `@excalidraw/excalidraw` 0.18.0-2c3dcc0, every member of
 * its `ExcalidrawProps` and of its `ExcalidrawImperativeAPI` is here under
 * Excalidraw's name, or listed below with the barq idiom it is. The names
 * are read from copies of its published `index.d.ts` and `types.d.ts`, in
 * `fixtures/`, so one Excalidraw adds cannot go missing unnoticed. Its types
 * are not a dependency: resolving them retypes `@excalidraw/element`'s
 * `AppState` parameters as Excalidraw's own.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderEditor, unmountEditors } from "./editor/test-editor.ts";

const REFERENCE = join(import.meta.dir, "fixtures/excalidraw-0.18.0-2c3dcc0");

function read(file: string): string {
  return readFileSync(join(REFERENCE, `${file}.txt`), "utf8");
}

function own(file: string): string {
  return readFileSync(join(import.meta.dir, file), "utf8");
}

/** The names a module's `export { ... }`, `export type { ... }` and `export declare` give. */
function exportNames(source: string): string[] {
  const names = new Set<string>();
  for (const [, list] of source.matchAll(/export (?:type )?\{([^}]*)\}/g)) {
    for (const part of list!.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.replace(/^type\s+/, "")
        .trim();
      if (name) names.add(name);
    }
  }
  for (const [, name] of source.matchAll(/export declare (?:const|function|class) (\w+)/g)) {
    names.add(name!);
  }
  return [...names];
}

/** The members of `interface name { ... }`: names at its own depth, comments skipped. */
function interfaceMembers(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name}`);
  if (start === -1) throw new Error(`no interface ${name}`);
  const body = source.slice(source.indexOf("{", start) + 1);
  const members = new Set<string>();
  let depth = 0;
  let atStart = true;
  for (let index = 0; index < body.length; index++) {
    const char = body[index]!;
    if (char === "/" && body[index + 1] === "*") {
      index = body.indexOf("*/", index) + 1;
      continue;
    }
    if (char === "/" && body[index + 1] === "/") {
      index = body.indexOf("\n", index) - 1;
      continue;
    }
    if (char === "{" || char === "(" || char === "[" || char === "<") depth++;
    else if (char === ">" && body[index - 1] !== "=") depth--;
    else if (char === ")" || char === "]") depth--;
    else if (char === "}") {
      if (depth === 0) break;
      depth--;
    }
    if (depth === 0 && (char === ";" || char === "\n")) {
      atStart = true;
      continue;
    }
    if (depth === 0 && atStart && /\S/.test(char)) {
      atStart = false;
      const member = /^(?:readonly\s+)?"?([\w-]+)"?\??\s*[:(<]/.exec(body.slice(index));
      if (member) members.add(member[1]!);
    }
  }
  return [...members];
}

/** Excalidraw's names barq says another way, and why. */
const EQUIVALENT_EXPORTS: Record<string, string> = {
  Excalidraw: "DiagramEditor: the component, named for the package",
};
const EQUIVALENT_PROPS: Record<string, string> = {
  className: "class: barq's attribute for a class",
};

describe("the API pinned against Excalidraw's", () => {
  test("every export of index.d.ts is exported", () => {
    const reference = exportNames(read("index.d.ts"));
    expect(reference.length).toBeGreaterThan(80);
    const exported = new Set(exportNames(own("index.ts")));
    const missing = reference.filter((name) => !exported.has(name) && !EQUIVALENT_EXPORTS[name]);
    expect(missing).toEqual([]);
  });

  test("every ExcalidrawProps member is a DiagramEditorProps member", () => {
    const reference = interfaceMembers(read("types.d.ts"), "ExcalidrawProps");
    expect(reference).toContain("onExcalidrawAPI");
    expect(reference).not.toContain("prevElements");
    expect(reference.length).toBeGreaterThan(50);
    const props = new Set(interfaceMembers(own("diagram-editor.tsx"), "DiagramEditorProps"));
    const missing = reference.filter((name) => !props.has(name) && !EQUIVALENT_PROPS[name]);
    expect(missing).toEqual([]);
  });

  test("every ExcalidrawImperativeAPI member is on the editor's API", () => {
    const reference = interfaceMembers(read("types.d.ts"), "ExcalidrawImperativeAPI");
    expect(reference).toContain("setViewport");
    expect(reference.length).toBeGreaterThan(35);
    const declared = new Set(interfaceMembers(own("editor/editor.ts"), "DiagramEditorApi"));
    const { api } = renderEditor();
    try {
      const missing = reference.filter((name) => !declared.has(name) || !(name in api));
      expect(missing).toEqual([]);
    } finally {
      unmountEditors();
    }
  });
});
