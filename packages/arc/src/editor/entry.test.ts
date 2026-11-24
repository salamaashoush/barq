import { describe, expect, test } from "bun:test";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { importGraph } from "../test-graph.ts";

function LEXICAL(name: string): boolean {
  return name === "lexical" || name.startsWith("@lexical/") || name.startsWith("@barqjs/lexical");
}

describe("what an app pays for the editor", () => {
  const src = dirname(dirname(fileURLToPath(import.meta.url)));
  const editor = join(src, "editor") + sep;

  test("arc's main entry reaches no file of the editor entry and no Lexical at all", () => {
    const graph = importGraph(join(src, "index.ts"));
    expect([...graph.files].filter((file) => file.startsWith(editor))).toEqual([]);
    expect([...graph.packages.keys()].filter(LEXICAL)).toEqual([]);
    expect(graph.packages.has("yjs")).toBe(false);
  });

  test("the code entry reaches no Lexical either", () => {
    const graph = importGraph(join(src, "code", "index.ts"));
    expect([...graph.packages.keys()].filter(LEXICAL)).toEqual([]);
  });

  test("the editor entry is Lexical, and leaves Yjs to the collaboration entry", () => {
    const graph = importGraph(join(editor, "index.ts"));
    expect(graph.packages.has("lexical")).toBe(true);
    expect(graph.packages.has("@barqjs/lexical")).toBe(true);
    expect(graph.packages.has("yjs")).toBe(false);
    expect(graph.packages.has("@lexical/yjs")).toBe(false);
    expect(graph.packages.has("@barqjs/lexical/collaboration")).toBe(false);
  });

  test("a language for a code block loads only when a block names it", () => {
    const graph = importGraph(join(editor, "index.ts"));
    const languages = [...graph.packages.entries()].filter(([name]) =>
      name.startsWith("@codemirror/lang-"),
    );
    for (const [, kinds] of languages) expect([...kinds]).toEqual(["dynamic-import"]);
  });

  test("the collaboration entry is where the Yjs binding comes in", () => {
    const graph = importGraph(join(editor, "collaboration.tsx"));
    expect(graph.packages.has("@barqjs/lexical/collaboration")).toBe(true);
  });
});
