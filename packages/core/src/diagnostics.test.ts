/**
 * The one diagnostics channel: barq's findings and the engine's arrive on it
 * together, each with its code, its page and, where a development compile
 * named the components, the path to the one it happened in.
 *
 * The engine keeps a channel and owner names in its development build only, so
 * each claim says what the production build answers as well.
 */

import { describe, expect, test } from "bun:test";
import {
  DEV,
  OBSERVE,
  createComponent,
  createRenderEffect,
  createRoot,
  errorOwnerPath,
  getOwner,
} from "./signals.ts";
import { formatDiagnostic } from "./dev-console.ts";
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
    const capture = DEV.diagnostics.capture();
    // An effect with no owner is a finding of the engine's, not barq's.
    createRenderEffect(
      () => 1,
      () => {},
    );
    const engine = capture.stop().find((event) => event.code === "NO_OWNER_EFFECT");
    expect(engine !== undefined).toBe(named);
    if (engine !== undefined) expect(engine.docs).toContain("#no_owner_effect");
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
    expect(text).toStartWith("[barq] RENDER_SUBTREE_NOT_OWNED: `render` was given nodes");
    expect(text.includes("\n  in <App> › <Row>\n")).toBe(named);
    expect(text).toEndWith(`\n  docs: ${DOCS}/RENDER_SUBTREE_NOT_OWNED.md`);
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
