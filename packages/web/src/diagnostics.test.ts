/**
 * The one diagnostics channel: barq's findings and the engine's arrive on it
 * together, each with its code, its page and, where a development compile
 * named the components, the path to the one it happened in.
 *
 * The engine keeps a channel and owner names in its development build only, so
 * each claim says what the production build answers as well.
 */

import { describe, expect, spyOn, test } from "bun:test";
import {
  DEV,
  OBSERVE,
  createComponent,
  createRenderEffect,
  createRoot,
  errorOwnerPath,
  getOwner,
  labelled,
} from "@barqjs/core";
import {
  diagnosticFooter,
  formatDiagnostic,
  installDevConsole,
} from "../../core/src/dev-console.ts";
import { render } from "./dom.ts";

const DOCS = "https://github.com/salamaashoush/barq/blob/main/packages/core/docs/diagnostics";
const named = OBSERVE !== undefined;

function mountBuilt(): () => void {
  // An already-built subtree, which the root cannot own.
  return render(document.createElement("span"), document.createElement("div"));
}

describe("DEV.diagnostics", () => {
  test("capture collects what was emitted while it was open", () => {
    const capture = DEV.diagnostics.capture();
    mountBuilt()();
    const events = capture.stop();

    const hit = events.find((e) => e.code === "RENDER_SUBTREE_NOT_OWNED");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warn");
    expect(hit!.kind).toBe("owner");
    expect(hit!.docs).toBe(`${DOCS}/RENDER_SUBTREE_NOT_OWNED.md`);
  });

  test("nothing is collected after stop", () => {
    const capture = DEV.diagnostics.capture();
    const before = capture.stop().length;
    mountBuilt()();
    expect(capture.stop().length).toBe(before);
  });

  test("subscribe receives events and unsubscribes", () => {
    const seen: string[] = [];
    const unsubscribe = DEV.diagnostics.subscribe((e) => seen.push(e.code));
    mountBuilt()();
    unsubscribe();
    mountBuilt()();
    expect(seen).toEqual(["RENDER_SUBTREE_NOT_OWNED"]);
  });

  test("the engine's findings arrive on the same channel, with the page that explains them", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const capture = DEV.diagnostics.capture();
    let printed: string[];
    try {
      // An effect with no owner is a finding of the engine's, not barq's.
      createRenderEffect(
        () => 1,
        () => {},
      );
    } finally {
      printed = warn.mock.calls.map((call) => String(call[0]).split("\n")[0]);
      warn.mockRestore();
    }
    const engine = capture.stop().find((event) => event.code === "NO_OWNER_EFFECT");
    expect(engine !== undefined).toBe(named);
    if (engine !== undefined) expect(engine.docs).toEndWith("/diagnostics/no-owner-effect");
    expect(printed).toEqual(engine === undefined ? [] : [engine.message]);
  });
});

describe("createComponent", () => {
  function App(): void {
    createComponent(Row, {}, "Row");
  }
  function Row(): void {
    mountBuilt()();
  }

  test("a finding inside a named component carries the component path", () => {
    const capture = DEV.diagnostics.capture();
    createRoot((dispose) => {
      createComponent(App, {}, "App");
      dispose();
    });
    const [event] = capture.stop();
    expect(event?.code).toBe("RENDER_SUBTREE_NOT_OWNED");
    expect(event?.ownerPath).toEqual(named ? ["<App>", "<Row>"] : undefined);
  });

  test("the console line says where it happened and where the fix is written down", () => {
    const capture = DEV.diagnostics.capture();
    createRoot((dispose) => {
      createComponent(App, {}, "App");
      dispose();
    });
    const [event] = capture.stop();
    expect(event).toBeDefined();
    const text = event === undefined ? "" : formatDiagnostic(event);
    expect(text).toStartWith("[RENDER_SUBTREE_NOT_OWNED] `render` was given nodes");
    expect(text.endsWith("\n  in <App> › <Row>")).toBe(named);
    const footer = event === undefined ? "" : diagnosticFooter(event);
    expect(footer).toBe(
      `[RENDER_SUBTREE_NOT_OWNED] what it means and how to fix it: ${DOCS}/RENDER_SUBTREE_NOT_OWNED.md\n` +
        "[RENDER_SUBTREE_NOT_OWNED] agent repair guide: " +
        "node_modules/@barqjs/core/skills/diagnostics/SKILL.md#render_subtree_not_owned " +
        "(https://github.com/salamaashoush/barq/blob/main/packages/core/skills/diagnostics/SKILL.md#render_subtree_not_owned)",
    );
  });

  test("an error thrown while a component builds names the component path", () => {
    function Broken(): void {
      throw new Error("salama is not a number");
    }
    let caught: unknown;
    createRoot((dispose) => {
      try {
        createComponent(() => createComponent(Broken, {}, "Broken"), {}, "Page");
      } catch (error) {
        caught = error;
      }
      dispose();
    });
    expect((caught as Error).message).toBe("salama is not a number");
    expect(errorOwnerPath(caught)).toEqual(named ? ["<Page>", "<Broken>"] : undefined);
  });

  test("the owner it opens is transparent to the engine's numbering", () => {
    createRoot(
      (dispose) => {
        const outside = getOwner()?.id;
        let inside: string | undefined;
        createComponent(
          () => {
            inside = getOwner()?.id;
          },
          {},
          "Row",
        );
        expect(inside).toBe(outside);
        dispose();
      },
      { id: "r" },
    );
  });

  test("with no owner to attach to, the component is called as it is", () => {
    let owner: unknown = "unset";
    createComponent(
      () => {
        owner = getOwner();
      },
      {},
      "Row",
    );
    expect(owner).toBeNull();
  });
});

describe("source positions", () => {
  function Row(): void {
    mountBuilt()();
  }

  test("a finding inside a component says where the component is written", () => {
    const capture = DEV.diagnostics.capture();
    createRoot((dispose) => {
      createComponent(Row, {}, "Row", "src/list.tsx:9:5");
      dispose();
    });
    const [event] = capture.stop();
    expect(event?.loc).toBe(named ? "src/list.tsx:9:5" : undefined);
    const text = event === undefined ? "" : formatDiagnostic(event);
    expect(text.endsWith("\n  in <Row>\n  at src/list.tsx:9:5")).toBe(named);
  });

  test("a binding takes the name, the position and the element it was compiled with", () => {
    const element = document.createElement("li");
    let made: { _name?: string; _loc?: string; _devElement?: unknown } | null = null;
    const capture = DEV.diagnostics.capture();
    createRoot((dispose) => {
      createComponent(
        () =>
          labelled(
            "li.title",
            "src/list.tsx:12:9",
            () =>
              createRenderEffect(
                () => {
                  made = getOwner();
                  mountBuilt()();
                  return 1;
                },
                () => {},
              ),
            element,
          ),
        {},
        "Row",
      );
      dispose();
    });
    const [event] = capture.stop();
    expect(event?.ownerPath).toEqual(named ? ["<Row>", "li.title"] : undefined);
    expect(event?.loc).toBe(named ? "src/list.tsx:12:9" : undefined);
    const tagged = made as { _name?: string; _devElement?: unknown } | null;
    expect(tagged?._devElement).toBe(named ? element : undefined);
  });

  test("only the first owner a binding makes is named, and none after it", () => {
    const names: (string | undefined)[] = [];
    const read = (): void => {
      names.push((getOwner() as { _name?: string } | null)?._name);
    };
    const effect = (): void =>
      createRenderEffect(
        () => {
          read();
          return 1;
        },
        () => {},
      );
    createRoot((dispose) => {
      labelled("p.class", undefined, () => {
        effect();
        effect();
      });
      effect();
      dispose();
    });
    expect(names[0]).toBe(named ? "p.class" : undefined);
    expect(names[1]).not.toBe("p.class");
    expect(names[2]).not.toBe("p.class");
  });

  test("a binding that makes nothing leaves no name behind for the next owner", () => {
    let name: string | undefined;
    createRoot((dispose) => {
      labelled("p.id", undefined, () => {});
      createRenderEffect(
        () => {
          name = (getOwner() as { _name?: string } | null)?._name;
          return 1;
        },
        () => {},
      );
      dispose();
    });
    expect(name).not.toBe("p.id");
  });

  test("an engine finding ends with the page and the repair guide, once per code", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    let printed: string[];
    try {
      const uninstall = installDevConsole();
      for (let i = 0; i < 2; i++) {
        createRenderEffect(
          () => 1,
          () => {},
        );
      }
      uninstall();
    } finally {
      printed = warn.mock.calls.map((call) => String(call[0]));
      warn.mockRestore();
    }
    const footed = printed.filter((line) =>
      line.includes(
        "[NO_OWNER_EFFECT] agent repair guide: node_modules/@barqjs/core/skills/diagnostics/SKILL.md#no_owner_effect",
      ),
    );
    expect(footed.length).toBe(named ? 1 : 0);
    if (named) expect(footed[0]).toContain("/diagnostics/no-owner-effect\n");
  });

  test("a finding about cost also says where its evidence is captured", () => {
    const footer = diagnosticFooter({
      sequence: 1,
      code: "HOT_SCOPE_RERUNS",
      kind: "perf",
      severity: "warn",
      message: "[HOT_SCOPE_RERUNS] a scope re-ran 40 times",
    });
    expect(footer).toContain('deeper evidence: captureArtifact() from "@barqjs/diagnostics"');
    expect(footer).toContain("node_modules/@barqjs/diagnostics/skills/agent-loops/SKILL.md");
  });
});
