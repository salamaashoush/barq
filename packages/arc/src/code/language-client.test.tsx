import { afterEach, describe, expect, test } from "bun:test";
import { Show, createSignal, flush } from "@barqjs/core";
import { render, waitFor } from "@barqjs/testing";
import {
  type Completion,
  type CompletionInfo,
  acceptCompletion,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { foldable } from "@codemirror/language";
import { type Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import { findReferences, renameSymbol } from "@codemirror/lsp-client";
import type { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";

import { OutlineView } from "../components/outline-view.tsx";
import { CodeEditor } from "./code-editor.tsx";
import { defineLanguage } from "./define-language.ts";
import { type LanguageClient, type ServerMessage, languageClient } from "./language-client.ts";
import { showCodeActions } from "./lsp-actions.ts";
import { ask, connected } from "./lsp-context.ts";
import { formatCode } from "./lsp-format.ts";
import { type DocsView } from "./lsp-docs.tsx";
import { hoverAt } from "./lsp-hover.ts";
import { goToDefinition } from "./lsp-navigation.ts";
import { symbolNodes } from "./lsp-symbols.ts";
import { editorIn, place, queueSelectionChanges, type } from "./test-dom.ts";
import { LIB, LIB_SOURCE, MAIN, type ToyServer, toyServer } from "./test-language-server.ts";

queueSelectionChanges();

const toy = defineLanguage({
  name: "toy",
  keywords: ["fn", "let", "return", "use"],
  operators: ["=", "+", "*"],
  comments: { line: "#" },
});

const MAIN_SOURCE = [
  "fn add(a, b) {",
  "  return a + b",
  "}",
  "let total = add(1, 2)",
  "let more = double(total)",
  "",
].join("\n");

interface Setup {
  server: ToyServer;
  client: LanguageClient;
  navigations: string[];
  edits: Map<string, string>;
  messages: ServerMessage[];
  view: () => EditorView;
  libView: () => EditorView | undefined;
  container: HTMLElement;
  unmount: () => void;
  showLib: (shown: boolean) => void;
}

interface Cancel {
  id: number;
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function setup(source = MAIN_SOURCE): Promise<Setup> {
  const server = toyServer();
  const navigations: string[] = [];
  const edits = new Map<string, string>();
  const messages: ServerMessage[] = [];
  const [libShown, setLibShown] = createSignal(false);
  let view: EditorView | undefined;
  let libView: EditorView | undefined;
  let starts = 0;
  const client = languageClient({
    transport: () => {
      starts++;
      return server.transport;
    },
    rootUri: "file:///project/",
    languageId: "toy",
    onNavigate: (uri, range) => {
      navigations.push(`${uri}@${String(range?.start.line)}:${String(range?.start.character)}`);
      if (uri === LIB) {
        setLibShown(true);
        flush();
      }
    },
    onEdit: (uri, text) => edits.set(uri, text),
    onMessage: (message) => messages.push(message),
    configuration: (section) => (section === "toy.style" ? "tabs" : undefined),
  });
  expect(starts).toBe(0);
  expect(client.status()).toBe("idle");
  client.open(LIB, LIB_SOURCE);
  const { container, unmount } = render(() => (
    <div>
      <CodeEditor
        label="main.toy"
        language={toy}
        defaultValue={source}
        folding
        extensions={client.document(MAIN)}
        onView={(created) => {
          view = created;
        }}
      />
      <Show when={libShown()}>
        <CodeEditor
          label="lib.toy"
          language={toy}
          defaultValue={LIB_SOURCE}
          extensions={client.document(LIB)}
          onView={(created) => {
            libView = created;
            return () => {
              libView = undefined;
            };
          }}
        />
      </Show>
    </div>
  ));
  cleanups.push(() => {
    unmount();
    client.dispose();
  });
  await editorIn(container);
  await waitFor(() => {
    if (client.status() !== "ready") throw new Error(client.status());
    if (server.documents().get(MAIN) === undefined) throw new Error("main not open");
  });
  expect(starts).toBe(1);
  return {
    server,
    client,
    navigations,
    edits,
    messages,
    view: () => view as EditorView,
    libView: () => libView,
    container,
    unmount,
    showLib: (shown) => {
      setLibShown(shown);
      flush();
    },
  };
}

function diagnosticsOf(view: EditorView): Diagnostic[] {
  const found: Diagnostic[] = [];
  forEachDiagnostic(view.state, (one) => found.push(one));
  return found;
}

function positionOf(view: EditorView, text: string, after = 0): number {
  return view.state.doc.toString().indexOf(text, after);
}

describe("connecting", () => {
  test("starts on the first file, negotiates, and opens each file once with its URI", async () => {
    const { server, client } = await setup();
    const init = server.initialize;
    expect(init?.rootUri).toBe("file:///project/");
    expect(init?.capabilities.textDocument?.completion?.completionItem?.snippetSupport).toBe(true);
    expect(init?.capabilities.textDocument?.completion?.completionItem?.resolveSupport).toEqual({
      properties: ["documentation", "detail", "additionalTextEdits"],
    });
    expect(init?.capabilities.workspace?.applyEdit).toBe(true);
    expect(init?.capabilities.window?.workDoneProgress).toBe(true);
    expect(client.capabilities()?.hoverProvider).toBe(true);
    expect([...server.documents().keys()].toSorted()).toEqual([LIB, MAIN]);
    expect(server.documents().get(MAIN)?.languageId).toBe("toy");
    const opens = server.wire.filter((one) => one.message.method === "textDocument/didOpen");
    expect(opens.length).toBe(2);
    expect(server.wire[0]?.message.method).toBe("initialize");
  });

  test("sends a large file's edits as ranges, and the server's copy stays the editor's", async () => {
    const long = `${MAIN_SOURCE}${"# filler line\n".repeat(90)}`;
    const { server, view } = await setup(long);
    place(view(), 3);
    type(view(), "Z");
    connected(view())?.plugin.client.sync();
    await waitFor(() => {
      if (server.documents().get(MAIN)?.text !== view().state.doc.toString()) {
        throw new Error("not synced");
      }
    });
    const changes = server.wire.filter((one) => one.message.method === "textDocument/didChange");
    const last = changes.at(-1)?.message.params as lsp.DidChangeTextDocumentParams;
    expect(last.contentChanges).toEqual([
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } }, text: "Z" },
    ]);
    expect(last.textDocument.version).toBeGreaterThan(0);
  });

  test("closes a file when its editor goes, and keeps one the app opened", async () => {
    const { server, unmount } = await setup();
    unmount();
    await waitFor(() => {
      if (server.documents().has(MAIN)) throw new Error("still open");
    });
    expect(server.documents().get(LIB)?.text).toBe(LIB_SOURCE);
  });

  test("a file the app opened takes the editor's text when one shows it, and keeps it after", async () => {
    const server = toyServer();
    const client = languageClient({ transport: server.transport, languageId: "toy" });
    client.open(MAIN, "let a = 1\n");
    await waitFor(() => {
      if (server.documents().get(MAIN)?.text !== "let a = 1\n") throw new Error("not open");
    });
    client.update(MAIN, "let a = 2\n");
    await waitFor(() => {
      if (server.documents().get(MAIN)?.text !== "let a = 2\n") throw new Error("not updated");
    });
    let view: EditorView | undefined;
    const { container, unmount } = render(() => (
      <CodeEditor
        label="main"
        defaultValue={"let a = 3\n"}
        extensions={client.document(MAIN)}
        onView={(created) => {
          view = created;
        }}
      />
    ));
    await editorIn(container);
    await waitFor(() => {
      if (server.documents().get(MAIN)?.text !== "let a = 3\n") throw new Error("not taken");
    });
    type(view as EditorView, "#");
    unmount();
    await waitFor(() => {
      if (server.documents().get(MAIN)?.text !== "#let a = 3\n") throw new Error("not kept");
    });
    client.close(MAIN);
    await waitFor(() => {
      if (server.documents().has(MAIN)) throw new Error("still open");
    });
    client.dispose();
    flush();
    expect(client.status()).toBe("closed");
  });

  test("a transport that fails leaves the client failed, and every feature quiet", async () => {
    const errors: unknown[] = [];
    const client = languageClient({
      transport: () => Promise.reject(new Error("no worker")),
      onError: (error) => errors.push(error),
    });
    client.open(MAIN, "x");
    await waitFor(() => {
      if (client.status() !== "failed") throw new Error(client.status());
    });
    expect(String(errors[0])).toContain("no worker");
  });
});

describe("diagnostics", () => {
  test("are underlined with their code and related places, listed per file, and fixable", async () => {
    const { client, view, navigations } = await setup(
      `${MAIN_SOURCE}missing(1)\n# TODO\nlet unused = 1\n`,
    );
    await waitFor(() => {
      if (diagnosticsOf(view()).length < 3) throw new Error("not yet");
    });
    const found = diagnosticsOf(view());
    expect(found.map((one) => `${one.severity}:${one.message}`)).toEqual([
      "error:Nothing defines missing.",
      "warning:Finish this.",
      "hint:Never read.",
    ]);
    expect(found[2]?.markClass).toBe("cm-lsp-unnecessary");
    const missing = found[0] as Diagnostic;
    expect(view().state.sliceDoc(missing.from, missing.to)).toBe("missing");
    expect(missing.actions?.map((one) => one.name)).toEqual(["Quick fix"]);

    const message = missing.renderMessage?.(view()) as HTMLElement;
    expect(message.querySelector(".cm-lsp-diagnostic-code")?.getAttribute("href")).toBe(
      "https://example.com/toy/unknown-fn",
    );
    const related = message.querySelector<HTMLButtonElement>(".cm-lsp-related-place");
    expect(related?.textContent).toBe("lib.toy:1");
    expect(message.querySelector(".cm-lsp-related li")?.textContent).toContain(
      "A function is defined like this.",
    );
    related?.click();
    expect(navigations).toEqual([`${LIB}@0:3`]);

    const files = client.diagnostics();
    expect(files.map((one) => one.uri).toSorted()).toEqual([LIB, MAIN]);
    expect(files.find((one) => one.uri === MAIN)?.diagnostics.length).toBe(3);
  });

  test("follow an edit: a fixed call stops being an error", async () => {
    const { view } = await setup(`${MAIN_SOURCE}missing(1)\n`);
    await waitFor(() => {
      if (diagnosticsOf(view()).length === 0) throw new Error("not yet");
    });
    const at = positionOf(view(), "missing");
    view().dispatch({ changes: { from: at, to: at + 7, insert: "add" } });
    await waitFor(
      () => {
        if (diagnosticsOf(view()).length > 0) throw new Error("still there");
      },
      { timeout: 3000 },
    );
  });
});

describe("hover, completion and signatures", () => {
  test("hover draws the server's markdown with arc, its code in the file's language", async () => {
    const { view } = await setup();
    const tooltip = await hoverAt(view(), positionOf(view(), "add(1") + 1);
    expect(tooltip).not.toBeNull();
    expect(view().state.sliceDoc(tooltip?.pos, tooltip?.end)).toBe("add");
    const shown = tooltip?.create(view());
    const dom = shown?.dom as HTMLElement;
    expect(dom.querySelector('[data-slot="rich-text"]')).not.toBeNull();
    expect(dom.querySelector("pre")?.textContent).toContain("fn add(a, b)");
    expect(dom.querySelector("em")?.textContent).toBe("function");
    shown?.destroy?.();
    expect(await hoverAt(view(), positionOf(view(), "return") + 1)).toBeNull();
  });

  test("completion offers the server's items, resolves docs as one is picked, and applies snippets and their edits", async () => {
    const { view } = await setup();
    const end = view().state.doc.length;
    place(view(), end);
    type(view(), "dou");
    startCompletion(view());
    await waitFor(() => {
      if (currentCompletions(view().state).length === 0) throw new Error("no list");
    });
    const options = currentCompletions(view().state);
    const double = options.find((one) => one.label === "double") as Completion;
    expect(double.type).toBe("function");
    expect(double.detail).toBe("(x)");
    const info = (await (double.info as (completion: Completion) => Promise<CompletionInfo>)(
      double,
    )) as DocsView;
    expect(info.dom.querySelector("pre")?.textContent).toContain("fn double(x)");
    expect(info.dom.querySelector("strong")?.textContent).toBe("double");
    info.destroy?.();

    view().dispatch({ effects: setSelectedCompletion(options.indexOf(double)) });
    // A list taken within its first moments is taken by accident, so CodeMirror waits them out.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acceptCompletion(view())).toBe(true);
    const text = view().state.doc.toString();
    expect(text.slice(0, 14)).toBe("use lib\nfn add");
    expect(text.endsWith("double(x)")).toBe(true);
    const selection = view().state.selection.main;
    expect(view().state.sliceDoc(selection.from, selection.to)).toBe("x");
  });

  test("a call's signature shows as its bracket is typed, the parameter being typed marked", async () => {
    const { view, container } = await setup();
    place(view(), view().state.doc.length);
    type(view(), "add(");
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-signature-tooltip") === null) throw new Error("none");
    });
    const tooltip = container.querySelector(".cm-lsp-signature-tooltip");
    expect(tooltip?.querySelector(".cm-lsp-signature")?.textContent).toBe("add(a, b)");
    expect(tooltip?.querySelector(".cm-lsp-active-parameter")?.textContent).toBe("a");
    type(view(), "1,");
    await waitFor(() => {
      const active = container.querySelector(".cm-lsp-active-parameter")?.textContent;
      if (active !== "b") throw new Error(String(active));
    });
  });
});

describe("navigation and edits across files", () => {
  test("definition selects in this file, and names the other file and range to the app", async () => {
    const { view, navigations, showLib, libView } = await setup();
    place(view(), positionOf(view(), "add(1") + 1);
    expect(goToDefinition(view())).toBe(true);
    await waitFor(() => {
      const { from, to } = view().state.selection.main;
      if (view().state.sliceDoc(from, to) !== "add") throw new Error("not selected");
    });
    expect(view().state.selection.main.from).toBe(3);

    place(view(), positionOf(view(), "double") + 1);
    goToDefinition(view());
    await waitFor(() => {
      if (navigations.length === 0) throw new Error("not asked");
    });
    expect(navigations).toEqual([`${LIB}@0:3`]);
    await waitFor(() => {
      const lib = libView();
      if (lib === undefined) throw new Error("lib not shown");
      const { from, to } = lib.state.selection.main;
      if (lib.state.sliceDoc(from, to) !== "double") throw new Error("not selected");
    });
    showLib(false);
  });

  test("references list every use in every file", async () => {
    const { view, container } = await setup();
    place(view(), positionOf(view(), "double") + 1);
    expect(findReferences(view())).toBe(true);
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-reference-panel") === null) throw new Error("none");
    });
    const panel = container.querySelector(".cm-lsp-reference-panel");
    expect(
      [...(panel?.querySelectorAll(".cm-lsp-reference-file") ?? [])].map((one) => one.textContent),
    ).toEqual(["lib.toy", "main.toy"]);
    expect(panel?.querySelectorAll(".cm-lsp-reference").length).toBe(2);
  });

  test("rename changes every file, and tells the app about the one no editor shows", async () => {
    const { view, container, edits, server } = await setup();
    place(view(), positionOf(view(), "double") + 1);
    expect(renameSymbol(view())).toBe(true);
    const input = container.querySelector<HTMLInputElement>(
      ".cm-lsp-rename-panel input[name=name]",
    );
    expect(input?.value).toBe("double");
    (input as HTMLInputElement).value = "twice";
    input?.form?.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => {
      if (!view().state.doc.toString().includes("twice(total)")) throw new Error("main unchanged");
    });
    await waitFor(() => {
      if (edits.get(LIB) !== "fn twice(x) {\n  return x * 2\n}\n") throw new Error("lib unchanged");
    });
    await waitFor(() => {
      if (!(server.documents().get(LIB)?.text ?? "").startsWith("fn twice"))
        throw new Error("server");
    });
  });

  test("formats the document, the selection, and as a trigger character is typed", async () => {
    const { view } = await setup("let a = 1   \nlet b = 2  \n");
    place(view(), 0);
    view().dispatch({ selection: { anchor: 0, head: 5 } });
    expect(formatCode(view())).toBe(true);
    await waitFor(() => {
      if (view().state.doc.toString() !== "let a = 1\nlet b = 2  \n") throw new Error("range");
    });
    place(view(), 0);
    formatCode(view());
    await waitFor(() => {
      if (view().state.doc.toString() !== "let a = 1\nlet b = 2\n") throw new Error("document");
    });
    place(view(), view().state.doc.length);
    type(view(), "let c = 3 ;");
    await waitFor(() => {
      if (!view().state.doc.toString().endsWith("let c = 3;")) throw new Error("on type");
    });
  });
});

describe("what the server draws in the editor", () => {
  test("semantic tokens colour names with the theme's token classes", async () => {
    const { container } = await setup(`${MAIN_SOURCE}old(1)\n`);
    await waitFor(() => {
      if (container.querySelector(".cm-semantic-parameter") === null) throw new Error("none");
    });
    const functions = [...container.querySelectorAll(".cm-content .cm-semantic-function")];
    expect(functions.map((one) => one.textContent)).toContain("add");
    expect(functions.every((one) => one.classList.contains("tok-function"))).toBe(true);
    expect(
      [...container.querySelectorAll(".cm-semantic-parameter")].map((one) => one.textContent),
    ).toEqual(["a", "b"]);
    expect(container.querySelector(".cm-semantic-deprecated")?.textContent).toBe("old");
  });

  test("inlay hints name parameters and types, hidden from a screen reader", async () => {
    const { container } = await setup(`${MAIN_SOURCE}let n = 1\n`);
    await waitFor(() => {
      if (container.querySelectorAll(".cm-inlay-hint").length < 4) throw new Error("none");
    });
    const hints = [...container.querySelectorAll(".cm-inlay-hint")];
    expect(hints.map((one) => one.textContent)).toEqual(["a:", "b:", "x:", ": num"]);
    expect(hints.every((one) => one.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(hints[0]?.classList.contains("cm-inlay-hint-parameter")).toBe(true);
    expect(hints[3]?.classList.contains("cm-inlay-hint-type")).toBe(true);
  });

  test("code lenses are resolved, sit above their line, and run their command", async () => {
    const { container, server } = await setup();
    await waitFor(() => {
      if (container.querySelector(".cm-code-lens") === null) throw new Error("none");
    });
    const lens = container.querySelector<HTMLButtonElement>(".cm-code-lens");
    expect(lens?.textContent).toBe("1 uses");
    lens?.click();
    await waitFor(() => {
      if (server.commands.length === 0) throw new Error("not run");
    });
    expect(server.commands[0]).toEqual({ command: "toy.run", arguments: ["add"] });
  });

  test("the server's folding ranges fold a function's body", async () => {
    const { view } = await setup();
    await waitFor(() => {
      const line = view().state.doc.line(1);
      if (foldable(view().state, line.from, line.to) === null) throw new Error("none");
    });
    const first = view().state.doc.line(1);
    expect(foldable(view().state, first.from, first.to)).toEqual({
      from: first.to,
      to: view().state.doc.line(2).to,
    });
  });

  test("document symbols feed an outline, and follow the file", async () => {
    const { client, view } = await setup();
    const { container } = render(() => (
      <OutlineView aria-label="Outline" nodes={symbolNodes(client.symbols(MAIN) ?? [])} />
    ));
    await waitFor(() => {
      flush();
      if (!container.textContent?.includes("add")) throw new Error("none");
    });
    expect(
      [...container.querySelectorAll("li")].map((one) => one.firstElementChild?.textContent),
    ).toEqual(["add", "a", "b"]);
    place(view(), view().state.doc.length);
    type(view(), "fn sub(c) {\n}\n");
    await waitFor(
      () => {
        flush();
        if (!container.textContent?.includes("sub")) throw new Error("not followed");
      },
      { timeout: 3000 },
    );
  });
});

describe("asked before the server is up", () => {
  test("symbols read before a file opens arrive once it does, and a command waits for the server", async () => {
    const server = toyServer();
    let starts = 0;
    const client = languageClient({
      transport: () => {
        starts++;
        return server.transport;
      },
      languageId: "toy",
    });
    cleanups.push(() => client.dispose());
    expect(client.symbols(LIB)).toBeUndefined();
    expect(starts).toBe(0);
    client.open(LIB, LIB_SOURCE);
    const ran = client.executeCommand({ title: "Run", command: "toy.run", arguments: [] });
    await waitFor(() => {
      flush();
      if (client.symbols(LIB)?.[0]?.name !== "double") throw new Error("no symbols");
    });
    await ran;
    expect(server.commands).toEqual([{ command: "toy.run", arguments: [] }]);
  });
});

describe("code actions", () => {
  test("a quick fix lists the server's actions, preferred first, and Enter applies one", async () => {
    const { view, container } = await setup(`${MAIN_SOURCE}missing(1)\n`);
    await waitFor(() => {
      if (diagnosticsOf(view()).length === 0) throw new Error("not checked");
    });
    const missing = diagnosticsOf(view())[0] as Diagnostic;
    missing.actions?.[0]?.apply(view(), missing.from, missing.to);
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-actions") === null) throw new Error("no menu");
    });
    const menu = container.querySelector<HTMLElement>(".cm-lsp-actions") as HTMLElement;
    expect(menu.getAttribute("role")).toBe("listbox");
    expect(menu.getAttribute("aria-label")).toBe("Code actions");
    const options = [...menu.querySelectorAll('[role="option"]')];
    expect(options.map((one) => one.textContent)).toEqual(["Define missing", "Run the file"]);
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(menu.getAttribute("aria-activedescendant")).toBe(options[0]?.id ?? "");
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => {
      if (!view().state.doc.toString().endsWith("fn missing() {\n}\n"))
        throw new Error("not fixed");
    });
    expect(container.querySelector(".cm-lsp-actions")).toBeNull();
  });

  test("an action without its edit is resolved first, and a command goes to the server", async () => {
    const { view, container, server } = await setup(`${MAIN_SOURCE}# TODO\n`);
    await waitFor(() => {
      if (diagnosticsOf(view()).length === 0) throw new Error("not checked");
    });
    place(view(), positionOf(view(), "TODO") + 1);
    expect(showCodeActions(view())).toBe(true);
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-actions") === null) throw new Error("no menu");
    });
    const menu = container.querySelector<HTMLElement>(".cm-lsp-actions") as HTMLElement;
    expect([...menu.querySelectorAll('[role="option"]')].map((one) => one.textContent)).toEqual([
      "Remove TODO",
      "Run the file",
    ]);
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => {
      if (view().state.doc.toString().includes("TODO")) throw new Error("not removed");
    });
    place(view(), 0);
    showCodeActions(view());
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-actions") === null) throw new Error("no menu");
    });
    container.querySelector<HTMLElement>(".cm-lsp-action")?.click();
    await waitFor(() => {
      if (server.commands.length === 0) throw new Error("not run");
    });
    expect(server.commands[0]).toEqual({ command: "toy.run", arguments: [MAIN] });
  });

  test("Escape closes the list and gives the editor back its focus", async () => {
    const { view, container } = await setup();
    showCodeActions(view());
    await waitFor(() => {
      if (container.querySelector(".cm-lsp-actions") === null) throw new Error("no menu");
    });
    const menu = container.querySelector<HTMLElement>(".cm-lsp-actions") as HTMLElement;
    menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flush();
    expect(container.querySelector(".cm-lsp-actions")).toBeNull();
  });
});

describe("the server's own requests and notifications", () => {
  test("a workspace edit from a command changes the open editor and the file no editor shows", async () => {
    const { client, view, edits, server } = await setup(`${MAIN_SOURCE}# TODO\n`);
    await client.executeCommand({ title: "Fix all", command: "toy.fixAll" });
    expect(view().state.doc.toString()).toContain("# DONE");
    expect(server.answers.get("workspace/applyEdit")).toEqual({ applied: true });
    expect(edits.size).toBe(0);
  });

  test("progress is reported, cancellable, and ends with the server's message", async () => {
    const { client, server, messages } = await setup();
    const done = client.executeCommand({ title: "Build", command: "toy.build" });
    await waitFor(() => {
      const task = client.progress()[0];
      if (task?.percentage !== 50) throw new Error("no progress");
    });
    expect(client.progress()).toEqual([
      { token: "build", title: "Building", message: "main.toy", percentage: 50, cancellable: true },
    ]);
    expect(server.answers.get("window/workDoneProgress/create")).toBeNull();
    client.cancelProgress("build");
    await waitFor(() => {
      if (!server.cancelled.includes("progress:build")) throw new Error("not cancelled");
    });
    server.release();
    await done;
    await waitFor(() => {
      if (client.progress().length > 0) throw new Error("still going");
    });
    expect(messages).toEqual([{ type: "info", message: "Built." }]);
  });

  test("configuration is answered by the app, and a request the client has no answer for is refused", async () => {
    const { client, server } = await setup();
    await client.executeCommand({ title: "Ask", command: "toy.ask" });
    expect(server.answers.get("workspace/configuration")).toEqual(["tabs", null]);
    expect(server.answers.get("toy/unknown")).toEqual({
      code: -32601,
      message: "The client does not handle toy/unknown.",
    });
  });

  test("a dropped request is cancelled on the server", async () => {
    const { view, server } = await setup();
    const found = connected(view());
    if (found === null) throw new Error("not connected");
    place(view(), view().state.doc.length);
    type(view(), "slow");
    found.plugin.client.sync();
    const controller = new AbortController();
    const asked = ask(
      found.plugin.client,
      "textDocument/completion",
      {
        textDocument: { uri: MAIN },
        position: found.plugin.toPosition(view().state.doc.length),
      },
      controller.signal,
    );
    await waitFor(() => {
      const sent = server.wire.some(
        (one) => one.from === "client" && one.message.method === "textDocument/completion",
      );
      if (!sent) throw new Error("not sent");
    });
    controller.abort();
    await expect(asked).rejects.toEqual({ code: -32800, message: "Cancelled." });
    expect(server.cancelled).toEqual(["textDocument/completion"]);
    const cancel = server.wire.find((one) => one.message.method === "$/cancelRequest");
    const request = server.wire.find(
      (one) => one.from === "client" && one.message.method === "textDocument/completion",
    );
    expect((cancel?.message.params as Cancel | undefined)?.id).toBe(request?.message.id as number);
  });
});
