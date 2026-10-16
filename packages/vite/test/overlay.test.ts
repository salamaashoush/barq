/**
 * The development overlay, driven as a page drives it: payloads over the hot
 * channel, diagnostics from the runtime, and errors nothing caught.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  frameAround,
  mountOverlay,
  overlayModule,
  type OverlayDiagnostic,
  type OverlayPayload,
  type OverlayRuntimeEvent,
  type OverlayServerEntry,
} from "../src/overlay.ts";
import { serverEntry, stackFrames } from "../src/server-diagnostics.ts";

const CONFIG = {
  event: "barq:diagnostics",
  ready: "barq:diagnostics:ready",
  server: "barq:server-diagnostics",
  clear: "barq:server-diagnostics:clear",
  root: "/app",
};

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

interface Mounted {
  send(payload: Partial<OverlayPayload>): void;
  serve(entry: OverlayServerEntry): void;
  emit(event: OverlayRuntimeEvent): void;
  sent: string[];
  root: ShadowRoot;
  pill(): HTMLButtonElement;
  panel(): HTMLElement;
  open(): boolean;
  entries(): HTMLElement[];
  dispose(): void;
}

let mounted: Mounted | undefined;

afterEach(() => {
  mounted?.dispose();
  mounted = undefined;
});

function mount(): Mounted {
  const listeners = new Map<string, (data: never) => void>();
  let report: ((event: OverlayRuntimeEvent) => void) | undefined;
  const sent: string[] = [];
  const overlay = mountOverlay(
    {
      on: (event, listener) => {
        listeners.set(event, listener);
      },
      send: (event) => sent.push(event),
    },
    {
      subscribe: (listener) => {
        report = listener;
        return () => {
          report = undefined;
        };
      },
    },
    CONFIG,
  );
  const root = overlay.element.shadowRoot!;
  const panel = (): HTMLElement => root.querySelector(".panel")!;
  mounted = {
    send: (payload) =>
      (listeners.get(CONFIG.event) as ((data: OverlayPayload) => void) | undefined)?.({
        overlay: "error",
        diagnostics: [],
        ...payload,
      }),
    serve: (entry) =>
      (listeners.get(CONFIG.server) as ((data: OverlayServerEntry) => void) | undefined)?.(entry),
    emit: (event) => report?.(event),
    sent,
    root,
    pill: () => root.querySelector(".pill")!,
    panel,
    open: () => overlay.element.isConnected && !panel().hidden,
    entries: () => [...root.querySelectorAll<HTMLElement>(".entry")],
    dispose: () => overlay.dispose(),
  };
  return mounted;
}

const diagnostic = (over: Partial<OverlayDiagnostic> = {}): OverlayDiagnostic => ({
  code: "BARQ001",
  severity: "warning",
  message: "`count` is an accessor. Call it — `count()`.",
  file: "/app/src/Card.tsx",
  line: 3,
  column: 12,
  endLine: 3,
  endColumn: 17,
  docs: "https://example.com/docs/BARQ001.md",
  frame: { first: 1, lines: ["import x", "", "const v = `${count}`;", "", "export {}"] },
  ...over,
});

describe("what is on the page when nothing is wrong", () => {
  test("nothing: the overlay is not in the document, and it asked the server for what it missed", () => {
    const overlay = mount();
    expect(document.getElementById("barq-diagnostics")).toBeNull();
    expect(overlay.sent).toEqual(["barq:diagnostics:ready"]);
    overlay.send({ diagnostics: [] });
    expect(document.getElementById("barq-diagnostics")).toBeNull();
  });
});

describe("a warning", () => {
  test("raises a count in the corner and does not open over the page", () => {
    const overlay = mount();
    overlay.send({ diagnostics: [diagnostic()] });
    expect(overlay.open()).toBe(false);
    expect(overlay.pill().textContent).toBe("1 warning");
    expect(overlay.pill().getAttribute("aria-label")).toContain("1 warning");
  });

  test("opens when asked, with its code, its place, its source and where to read more", () => {
    const overlay = mount();
    overlay.send({ diagnostics: [diagnostic()] });
    overlay.pill().click();
    expect(overlay.open()).toBe(true);
    const [entry] = overlay.entries();
    expect(entry?.querySelector(".kind")?.textContent).toBe("warning");
    const code = entry?.querySelector<HTMLAnchorElement>("a.code");
    expect(code?.textContent).toBe("BARQ001");
    expect(code?.href).toBe("https://example.com/docs/BARQ001.md");
    expect(entry?.querySelector(".where")?.textContent).toBe("src/Card.tsx:3:12");
    expect(
      [...(entry?.querySelectorAll(".message code") ?? [])].map((node) => node.textContent),
    ).toEqual(["count", "count()"]);
    expect(entry?.querySelector(".row.hit")?.textContent).toContain("const v = `${count}`;");
    expect(entry?.querySelector(".caret")?.textContent).toBe(`${" ".repeat(11)}^^^^^`);
  });

  test("is opened by itself when the project asks for that", () => {
    const overlay = mount();
    overlay.send({ overlay: "warning", diagnostics: [diagnostic()] });
    expect(overlay.open()).toBe(true);
  });
});

describe("an error", () => {
  test("opens the overlay, announces itself, and sorts above what matters less", () => {
    const overlay = mount();
    overlay.send({
      diagnostics: [
        diagnostic(),
        diagnostic({ severity: "error", code: "BARQ012", line: 9, message: "mixed exports" }),
      ],
    });
    expect(overlay.open()).toBe(true);
    expect(overlay.entries().map((entry) => entry.querySelector(".code")?.textContent)).toEqual([
      "BARQ012",
      "BARQ001",
    ]);
    expect(overlay.root.querySelector(".live")?.textContent).toBe("barq: 1 error · 1 warning");
    expect(overlay.panel().getAttribute("role")).toBe("dialog");
  });

  test("closed by hand stays closed while the same payload keeps arriving", () => {
    const overlay = mount();
    const payload = { diagnostics: [diagnostic({ severity: "error" })] };
    overlay.send(payload);
    overlay.panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(overlay.open()).toBe(false);
    overlay.send(payload);
    overlay.send(payload);
    expect(overlay.open()).toBe(false);
    overlay.send({
      diagnostics: [...payload.diagnostics, diagnostic({ severity: "error", line: 20 })],
    });
    expect(overlay.open()).toBe(true);
  });

  test("goes when it is fixed, and takes the overlay with it", () => {
    const overlay = mount();
    overlay.send({ diagnostics: [diagnostic({ severity: "error" })] });
    overlay.send({ diagnostics: [] });
    expect(document.getElementById("barq-diagnostics")).toBeNull();
  });
});

describe("the filter", () => {
  test("shows one severity at a time and says so to assistive technology", () => {
    const overlay = mount();
    overlay.send({
      diagnostics: [
        diagnostic(),
        diagnostic({ severity: "error", line: 9 }),
        diagnostic({ severity: "note", line: 12 }),
      ],
    });
    const chips = (): HTMLElement[] => [...overlay.root.querySelectorAll<HTMLElement>(".chip")];
    expect(chips().map((chip) => chip.textContent)).toEqual([
      "All 3",
      "1 error",
      "1 warning",
      "1 note",
    ]);
    chips()[2]?.click();
    expect(overlay.entries()).toHaveLength(1);
    expect(overlay.entries()[0]?.querySelector(".kind")?.textContent).toBe("warning");
    expect(chips()[2]?.getAttribute("aria-pressed")).toBe("true");
    chips()[0]?.click();
    expect(overlay.entries()).toHaveLength(3);
  });
});

describe("what the page reports while it runs", () => {
  test("a runtime diagnostic joins the list under its code, counted rather than repeated", () => {
    const overlay = mount();
    const event = {
      code: "FUNCTION_AS_ATTRIBUTE",
      severity: "warn" as const,
      message: "title got a function",
    };
    overlay.emit(event);
    overlay.emit(event);
    overlay.emit(event);
    expect(overlay.pill().textContent).toBe("1 warning");
    overlay.pill().click();
    const [entry] = overlay.entries();
    expect(entry?.querySelector(".code")?.textContent).toBe("FUNCTION_AS_ATTRIBUTE");
    expect(entry?.querySelector(".times")?.textContent).toBe("×3");
  });

  test("a runtime diagnostic that names its docs page links its code to it", () => {
    const overlay = mount();
    const docs =
      "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics/FUNCTION_AS_ATTRIBUTE.md";
    overlay.emit({
      code: "FUNCTION_AS_ATTRIBUTE",
      severity: "warn",
      message: "The `title` attribute on `<p>` was given a function",
      docs,
    });
    overlay.emit({ code: "NO_PAGE", severity: "warn", message: "a diagnostic with no page" });
    overlay.pill().click();
    const [linked, plain] = overlay.entries();
    const link = linked?.querySelector<HTMLAnchorElement>("a.code");
    expect(link?.textContent).toBe("FUNCTION_AS_ATTRIBUTE");
    expect(link?.getAttribute("href")).toBe(docs);
    expect(plain?.querySelector(".code")?.textContent).toBe("NO_PAGE");
    expect(plain?.querySelector("a.code")).toBeNull();
  });

  test("an error nothing caught opens the overlay with its name and message", () => {
    const overlay = mount();
    window.dispatchEvent(
      new ErrorEvent("error", { error: new TypeError("props.title is not a function") }),
    );
    expect(overlay.open()).toBe(true);
    expect(overlay.entries()[0]?.querySelector(".message")?.textContent).toBe(
      "TypeError: props.title is not a function",
    );
  });

  test("a rejection nothing handled is one too, and runtime entries can be cleared", () => {
    const overlay = mount();
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = new Error("no such order");
    window.dispatchEvent(event);
    expect(overlay.entries()[0]?.querySelector(".message")?.textContent).toBe(
      "Error: no such order",
    );
    const clear = [...overlay.root.querySelectorAll<HTMLElement>(".tool")].find(
      (button) => button.textContent === "Clear runtime",
    );
    clear?.click();
    expect(document.getElementById("barq-diagnostics")).toBeNull();
  });
});

describe("where a runtime finding happened", () => {
  test("the component path is shown under the message and copied with it", () => {
    const overlay = mount();
    overlay.emit({
      code: "STRICT_READ_UNTRACKED",
      severity: "warn",
      message: "[STRICT_READ_UNTRACKED] Reactive value read directly in a component body",
      ownerPath: ["<App>", "<TodoRow>"],
      docs: "https://example.com/guide#strict_read_untracked",
    });
    overlay.pill().click();
    const [entry] = overlay.entries();
    expect(entry?.querySelector(".owners")?.textContent).toBe("in <App> › <TodoRow>");
  });

  test("a hydration mismatch links the JSX it was hydrating", () => {
    const overlay = mount();
    overlay.emit({
      code: "HYDRATION_MISMATCH",
      severity: "warn",
      message: "Hydration mismatch (structure)",
      data: { kind: "structure", template: "/app/src/greeting.tsx:3:49" },
      ownerPath: ["<Page>", "<Greeting>"],
    });
    overlay.pill().click();
    expect(overlay.entries()[0]?.querySelector(".where")?.textContent).toBe(
      "src/greeting.tsx:3:49",
    );
  });
});

describe("what the server reports", () => {
  const entry = (over: Partial<OverlayServerEntry> = {}): OverlayServerEntry => ({
    code: "SERVER_FUNCTION_FAILED",
    severity: "error",
    message: "TypeError: Cannot read properties of undefined (reading 'id')",
    docs: "https://example.com/SERVER_FUNCTION_FAILED.md",
    at: { file: "/app/src/todos.ts", line: 7, column: 21, library: false },
    frame: { first: 6, lines: ["export const add = () => {", "  return input.id;", "};"] },
    stack: [
      { file: "/app/src/todos.ts", line: 7, column: 21, name: "add", library: false },
      { file: "/app/node_modules/x/index.js", line: 1, column: 1, library: true },
    ],
    ...over,
  });

  test("opens the overlay as a server entry, with its frame and its stack", () => {
    const overlay = mount();
    overlay.serve(entry());
    expect(overlay.open()).toBe(true);
    const [shown] = overlay.entries();
    expect(shown?.querySelector(".origin")?.textContent).toBe("server");
    expect(shown?.querySelector(".message")?.textContent).toBe(
      "TypeError: Cannot read properties of undefined (reading 'id')",
    );
    expect(shown?.querySelector(".where")?.textContent).toBe("src/todos.ts:7:21");
    expect(shown?.querySelectorAll(".stack li")).toHaveLength(2);
    expect(shown?.querySelector(".stack .library")).not.toBeNull();
  });

  test("the same report again is counted, and Clear tells the server to forget it", () => {
    const overlay = mount();
    overlay.serve(entry());
    overlay.serve(entry());
    expect(overlay.entries()[0]?.querySelector(".times")?.textContent).toBe("×2");
    const clear = [...overlay.root.querySelectorAll<HTMLElement>(".tool")].find(
      (button) => button.textContent === "Clear runtime",
    );
    clear?.click();
    expect(overlay.sent).toContain(CONFIG.clear);
    expect(document.getElementById("barq-diagnostics")).toBeNull();
  });

  test("the dev server reads a Node stack into frames and cuts the first project frame", () => {
    const root = mkdtempSync(join(tmpdir(), "barq-server-entry-"));
    try {
      const file = join(root, "src.ts");
      writeFileSync(
        file,
        ["const a = 1;", "export function load() {", "  throw boom;", "}"].join("\n"),
      );
      const error = new Error("salama was not found");
      error.stack =
        "Error: salama was not found\n" +
        "    at runInRequest (/opt/node_modules/@barqjs/start/src/context.ts:10:3)\n" +
        `    at load (${file}:3:3)\n` +
        `    at file://${file}:2:1`;
      expect(stackFrames(error.stack, root).map((frame) => [frame.name, frame.library])).toEqual([
        ["runInRequest", true],
        ["load", false],
        [undefined, false],
      ]);
      const shown = serverEntry({ error, code: "SSR_RENDER_ERROR_CONTAINED" }, root);
      expect(shown.message).toBe("Error: salama was not found");
      expect(shown.severity).toBe("error");
      expect(shown.at).toEqual({ file, line: 3, column: 3, name: "load", library: false });
      expect(shown.frame?.lines).toContain("  throw boom;");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("a location", () => {
  test("opens that line in the editor", () => {
    const asked: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((input: string) => {
      asked.push(input);
      return Promise.resolve(new Response(""));
    }) as never;
    try {
      const overlay = mount();
      overlay.send({ diagnostics: [diagnostic({ severity: "error" })] });
      overlay.entries()[0]?.querySelector<HTMLElement>(".where")?.click();
      expect(asked).toEqual([
        `/__open-in-editor?file=${encodeURIComponent("/app/src/Card.tsx:3:12")}`,
      ]);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("what the server sends with a diagnostic", () => {
  test("two lines either side of it, numbered from the first", () => {
    const source = ["one", "two", "three", "four", "five", "six", "seven"].join("\n");
    expect(frameAround(source, 4)).toEqual({
      first: 2,
      lines: ["two", "three", "four", "five", "six"],
    });
    expect(frameAround(source, 1)).toEqual({ first: 1, lines: ["one", "two", "three"] });
    expect(frameAround(source, 7)).toEqual({ first: 5, lines: ["five", "six", "seven"] });
  });
});

describe("the module the page loads", () => {
  test("names nothing outside itself, so it runs as it is written", async () => {
    const source = overlayModule(CONFIG, "@barqjs/core");
    expect(source).toStartWith('import { DEV } from "@barqjs/core";');
    const body = source.slice(source.indexOf("\n") + 1).replace("import.meta.hot", "undefined");
    const module = `const DEV = undefined;\n${body}`;
    await import(`data:text/javascript,${encodeURIComponent(module)}`);
    expect(document.getElementById("barq-diagnostics")).toBeNull();
  });
});
