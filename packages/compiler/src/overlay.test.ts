/**
 * The development overlay, driven as a page drives it: payloads over the hot
 * channel, diagnostics from the runtime, and errors nothing caught.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import {
  frameAround,
  mountOverlay,
  overlayModule,
  type OverlayDiagnostic,
  type OverlayPayload,
} from "./overlay.ts";

const CONFIG = { event: "barq:diagnostics", ready: "barq:diagnostics:ready", root: "/app" };

beforeAll(() => {
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

interface Mounted {
  send(payload: Partial<OverlayPayload>): void;
  emit(event: {
    code: string;
    severity: "warning" | "error";
    message: string;
    docs?: string;
  }): void;
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
  let deliver: ((data: OverlayPayload) => void) | undefined;
  let report:
    | ((event: {
        code: string;
        severity: "warning" | "error";
        message: string;
        docs?: string;
      }) => void)
    | undefined;
  const sent: string[] = [];
  const overlay = mountOverlay(
    {
      on: (_event, listener) => {
        deliver = listener;
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
    send: (payload) => deliver?.({ overlay: "error", diagnostics: [], ...payload }),
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
      severity: "warning" as const,
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
      severity: "warning",
      message: "The `title` attribute on `<p>` was given a function",
      docs,
    });
    overlay.emit({ code: "NO_PAGE", severity: "warning", message: "a diagnostic with no page" });
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
