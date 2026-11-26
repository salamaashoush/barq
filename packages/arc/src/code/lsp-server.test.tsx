import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { render, waitFor } from "@barqjs/testing";
import { currentCompletions, startCompletion, type Completion } from "@codemirror/autocomplete";
import { forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { serverProcess } from "../ssr-harness.ts";
import { hydrates } from "../test-arc.ts";
import { CodeEditor } from "./code-editor.tsx";
import { languageClient } from "./language-client.ts";
import { offsetAt, positionAt, serveLanguageServer } from "./lsp-server.ts";
import { hoverAt } from "./lsp-hover.ts";
import { portTransport } from "./lsp-transport.ts";
import { editorIn, place, queueSelectionChanges } from "./test-dom.ts";
import { fileOfUri, typescriptServer } from "./typescript-server.ts";

queueSelectionChanges();

interface WireError {
  code: number;
  message: string;
}

interface Reply {
  id?: number;
  result?: unknown;
  error?: WireError;
}

interface Shown {
  dom: HTMLElement;
}

describe("positions", () => {
  test("count lines and UTF-16 units, and clamp what runs past a line or the text", () => {
    const text = "ab\nc😀d\n";
    expect(offsetAt(text, { line: 1, character: 3 })).toBe(6);
    expect(offsetAt(text, { line: 0, character: 99 })).toBe(2);
    expect(offsetAt(text, { line: 9, character: 0 })).toBe(text.length);
    expect(positionAt(text, 6)).toEqual({ line: 1, character: 3 });
    expect(positionAt(text, 0)).toEqual({ line: 0, character: 0 });
    expect(positionAt(text, 99)).toEqual({ line: 2, character: 0 });
  });

  test("a file URI is its path in the environment, another URI stays as it is", () => {
    expect(fileOfUri("file:///project/a%20b.ts")).toBe("/project/a b.ts");
    expect(fileOfUri("untitled:1")).toBe("untitled:1");
  });
});

describe("serveLanguageServer", () => {
  test("takes messages as strings or objects, and refuses a method it has no handler for", async () => {
    const channel = new MessageChannel();
    serveLanguageServer(channel.port2, { capabilities: { hoverProvider: true } });
    const replies: Reply[] = [];
    channel.port1.addEventListener("message", (event: MessageEvent) => {
      replies.push(JSON.parse(String(event.data)) as Reply);
    });
    channel.port1.start();
    channel.port1.postMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    channel.port1.postMessage(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "acme/nothing" }));
    channel.port1.postMessage({ jsonrpc: "2.0", id: 3, method: "shutdown" });
    await waitFor(() => {
      if (replies.length < 3) throw new Error("waiting");
    });
    expect(replies[0]?.result).toEqual({
      capabilities: { textDocumentSync: { openClose: true, change: 2 }, hoverProvider: true },
    });
    expect(replies[1]?.error).toEqual({ code: -32601, message: "No handler for acme/nothing." });
    expect(replies[2]).toEqual({ jsonrpc: "2.0", id: 3, result: null } as Reply);
  });

  test("a handler that throws answers with its error", async () => {
    const channel = new MessageChannel();
    serveLanguageServer(channel.port2, {
      capabilities: {},
      requests: {
        "acme/fail": () => {
          throw new Error("broken");
        },
      },
    });
    const replies: Reply[] = [];
    channel.port1.addEventListener("message", (event: MessageEvent) => {
      replies.push(JSON.parse(String(event.data)) as Reply);
    });
    channel.port1.start();
    channel.port1.postMessage(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "acme/fail" }));
    await waitFor(() => {
      if (replies.length === 0) throw new Error("waiting");
    });
    expect(replies[0]?.error).toEqual({ code: -32603, message: "broken" });
  });
});

/** An environment in the shape `@typescript/vfs` builds, answering from fixed data. */
function environment() {
  const files = new Map<string, string>();
  const env = {
    files,
    getSourceFile: (file: string) => {
      const text = files.get(file);
      return text === undefined ? undefined : { text };
    },
    createFile: (file: string, content: string) => files.set(file, content),
    updateFile: (file: string, content: string) => files.set(file, content),
    languageService: {
      getCompletionsAtPosition: () => ({
        entries: [
          { name: "goto", kind: "method", sortText: "11" },
          { name: "__private", kind: "property", sortText: "11" },
          { name: "url", kind: "property", sortText: "15", insertText: "url()" },
        ],
      }),
      getCompletionEntryDetails: () => ({
        displayParts: [{ text: "goto(" }, { text: "url: string" }, { text: "): Promise<void>" }],
        documentation: [{ text: "Opens a page." }],
      }),
      getQuickInfoAtPosition: () => ({
        textSpan: { start: 0, length: 4 },
        displayParts: [{ text: "const page: Page" }],
      }),
      getSyntacticDiagnostics: () => [],
      getSemanticDiagnostics: () => [
        {
          start: 0,
          length: 4,
          category: 1,
          messageText: {
            messageText: "Type mismatch.",
            next: [{ messageText: "Number is not a string." }],
          },
        },
        { start: 5, length: 2, category: 0, messageText: "Unused." },
      ],
    },
  };
  return env;
}

describe("TypeScript as a language server", () => {
  test("completion, docs resolved per item, hover and diagnostics, over the client", async () => {
    const env = environment();
    const channel = new MessageChannel();
    serveLanguageServer(
      channel.port2,
      typescriptServer(() => env, { checkDelay: 0 }),
    );
    const client = languageClient({ transport: portTransport(channel.port1) });
    let view: EditorView | undefined;
    const { container, unmount } = render(() => (
      <CodeEditor
        label="Script"
        language="typescript"
        defaultValue="page.go"
        extensions={client.document("file:///index.ts", "typescript")}
        onView={(created) => {
          view = created;
        }}
      />
    ));
    await editorIn(container);
    const live = view as EditorView;
    await waitFor(() => {
      if (env.files.get("/index.ts") !== "page.go") throw new Error("not opened");
    });

    place(live, 5);
    startCompletion(live);
    await waitFor(() => {
      if (currentCompletions(live.state).length === 0) throw new Error("no list");
    });
    const options = currentCompletions(live.state);
    expect(options.map((one) => one.label).toSorted()).toEqual(["goto", "url"]);
    const goto = options.find((one) => one.label === "goto") as Completion;
    expect(goto.type).toBe("method");
    const info = (await (goto.info as (one: Completion) => Promise<Shown>)(goto)).dom;
    expect(info.querySelector("pre")?.textContent).toContain("goto(url: string): Promise<void>");
    expect(info.textContent).toContain("Opens a page.");

    const hover = await hoverAt(live, 1);
    expect(live.state.sliceDoc(hover?.pos, hover?.end)).toBe("page");
    expect(hover?.create(live).dom.querySelector("pre")?.textContent).toContain("const page: Page");

    await waitFor(() => {
      let count = 0;
      forEachDiagnostic(live.state, () => count++);
      if (count < 2) throw new Error("not checked");
    });
    const found: string[] = [];
    forEachDiagnostic(live.state, (one) =>
      found.push(`${one.severity} ${one.source ?? ""}: ${one.message}`),
    );
    expect(found).toEqual([
      "error TypeScript: Type mismatch.\n  Number is not a string.",
      "warning TypeScript: Unused.",
    ]);
    const published = client.diagnostics()[0]?.diagnostics[0] as lsp.Diagnostic;
    expect(published.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 4 },
    });
    unmount();
    client.dispose();
  });
});

const entry = JSON.stringify(fileURLToPath(new URL("./index.ts", import.meta.url)));

describe("an editor with a language server, on a server and hydrated", () => {
  test("the server writes the static code and starts no language server", async () => {
    const { code, html, errors } = await serverProcess(`
      import { renderToStringAsync } from "@barqjs/server";
      import { CodeEditor, languageClient } from ${entry};
      const client = languageClient({ transport: () => { throw new Error("started on the server"); } });
      export async function page() {
        return await renderToStringAsync(() => (
          <CodeEditor label="Main" language="javascript" defaultValue={"let a = 1;"} extensions={client.document("file:///main.js")} />
        ));
      }
    `);
    expect(errors).toBe("");
    expect(code).toBe(0);
    expect(html).toContain('data-slot="code-static"');
    expect(html).toContain('<span class="tok-keyword">let</span>');
  });

  test("the browser keeps every node the server wrote", async () => {
    const result = await hydrates(`
      import { CodeEditor, languageClient } from ${entry};
      const client = languageClient({ transport: () => new Promise(() => {}) });
      export function Page() {
        return <CodeEditor label="Main" language="javascript" defaultValue={"let a = 1;"} extensions={() => client.document("file:///main.js")} />;
      }
    `);
    expect(result.container.querySelector('[data-slot="code-editor"]')?.getAttribute("dir")).toBe(
      "ltr",
    );
    result.unmount();
  });
});
