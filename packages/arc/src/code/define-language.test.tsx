import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { render } from "@barqjs/testing";
import { insertBracket } from "@codemirror/autocomplete";
import { toggleComment } from "@codemirror/commands";
import { foldable, getIndentation } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { CodeBlock } from "./code-block.tsx";
import { CodeEditor } from "./code-editor.tsx";
import { defineLanguage } from "./define-language.ts";
import { highlightLines } from "./highlight.ts";
import { editorIn, queueSelectionChanges, type } from "./test-dom.ts";

queueSelectionChanges();

const toy = defineLanguage({
  name: "toy",
  keywords: ["let", "fn", "if", "else", "return"],
  types: ["Int", "Text"],
  constants: ["true", "false", "nil"],
  builtins: ["print"],
  operators: ["==", "->", "=", "+", "<"],
  strings: [{ open: '"' }, { open: "`", multiline: true, escape: null }],
  comments: { line: "#", block: { open: "#[", close: "]#", nested: true } },
});

function classesOf(html: string): string[] {
  return [...html.matchAll(/<span class="tok-(\w+)">([^<]*)<\/span>/g)].map(
    (match) => `${match[1] ?? ""}:${match[2] ?? ""}`,
  );
}

describe("a language from a description", () => {
  test("its words, numbers, strings and comments take the theme's token classes", () => {
    const [first, second] = highlightLines(
      'let total: Int = 0x1F + 2.5e3 # running\nprint(total == nil, "a \\" b") -> add(x)',
      toy,
    );
    expect(classesOf(first ?? "")).toEqual([
      "keyword:let",
      "punctuation::",
      "type:Int",
      "punctuation:=",
      "number:0x1F",
      "punctuation:+",
      "number:2.5e3",
      "comment:# running",
    ]);
    expect(classesOf(second ?? "")).toEqual([
      "function:print",
      "punctuation:(",
      "punctuation:==",
      "number:nil",
      "punctuation:,",
      'string:"a \\" b"',
      "punctuation:)",
      "punctuation:-&gt;",
      "function:add",
      "punctuation:(",
      "punctuation:)",
    ]);
  });

  test("a multi-line string and a nested block comment keep their colour on every line", () => {
    const lines = highlightLines("`one\ntwo` #[ a #[ b ]# still\nin ]# let", toy);
    expect(classesOf(lines[0] ?? "")).toEqual(["string:`one"]);
    expect(classesOf(lines[1] ?? "")).toEqual(["string:two`", "comment:#[ a #[ b ]# still"]);
    expect(classesOf(lines[2] ?? "")).toEqual(["comment:in ]#", "keyword:let"]);
  });

  test("brackets indent what they hold, a closer dedents, and a block folds", () => {
    const doc = "fn main() {\n  if true {\n    print(1)\n  }\n}";
    const state = EditorState.create({ doc, extensions: [toy] });
    function line(number: number) {
      return state.doc.line(number);
    }
    expect(getIndentation(state, line(2).from)).toBe(2);
    expect(getIndentation(state, line(3).from)).toBe(4);
    expect(getIndentation(state, line(4).from)).toBe(2);
    expect(getIndentation(state, line(5).from)).toBe(0);
    expect(foldable(state, line(1).from, line(1).to)).toEqual({
      from: line(1).to,
      to: line(5).from,
    });
    expect(foldable(state, line(3).from, line(3).to)).toBeNull();
  });

  test("its comment and bracket data reach the editor's commands", () => {
    const state = EditorState.create({ doc: "x", extensions: [toy] });
    expect(state.languageDataAt("commentTokens", 0)).toEqual([
      { line: "#", block: { open: "#[", close: "]#" } },
    ]);
    expect(state.languageDataAt("closeBrackets", 0)).toEqual([
      { brackets: ["(", "[", "{", '"', "`"] },
    ]);
  });

  test("in an editor: a closer typed alone reindents, an opener closes itself, Mod-/ comments", async () => {
    let view: EditorView | undefined;
    const { container } = render(() => (
      <CodeEditor
        label="Script"
        language={toy}
        defaultValue={"fn f() {\n  x\n    "}
        onView={(created) => {
          view = created;
        }}
      />
    ));
    await editorIn(container);
    const live = view as EditorView;
    live.dispatch({ selection: { anchor: live.state.doc.length } });
    type(live, "}");
    expect(live.state.doc.toString()).toBe("fn f() {\n  x\n}");
    expect(insertBracket(live.state, "(")?.state.doc.toString()).toBe("fn f() {\n  x\n}()");
    live.dispatch({ selection: { anchor: 0 } });
    toggleComment(live);
    expect(live.state.doc.line(1).text).toBe("# fn f() {");
    expect(container.querySelector(".cm-content .tok-comment")?.textContent).toBe("# fn f() {");
  });
});

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

describe("on a server and hydrated", () => {
  test("a CodeBlock in a described language is highlighted by the server", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { CodeBlock, defineLanguage } from ${entry};
      const toy = defineLanguage({ name: "toy", keywords: ["let"], comments: { line: "#" } });
      export async function page() {
        return await renderToStringAsync(() => <CodeBlock language={toy} code={"let a = 1 # one"} />);
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('<span class="tok-keyword">let</span>');
    expect(html).toContain('<span class="tok-comment"># one</span>');
  });

  test("and the browser keeps every node the server wrote", async () => {
    const result = await hydrates(`
      import { CodeBlock, defineLanguage } from ${entry};
      const toy = defineLanguage({ name: "toy", keywords: ["let"], strings: [{ open: '"' }] });
      export function Page() {
        return <CodeBlock language={toy} code={'let a = "one"'} />;
      }
    `);
    expect(result.container.querySelector(".tok-string")?.textContent).toBe('"one"');
    result.unmount();
  });

  test("a CodeBlock reads the language it was given in the browser too", () => {
    const { container } = render(() => <CodeBlock language={toy} code="return nil" />);
    expect(container.querySelector(".tok-keyword")?.textContent).toBe("return");
    expect(container.querySelector(".tok-number")?.textContent).toBe("nil");
  });
});
