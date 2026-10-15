import { describe, expect, test } from "bun:test";
import {
  boundary,
  createRoot,
  createSignal,
  createTrackedEffect,
  flush,
  getOwner,
  render,
} from "@barqjs/core";
import { eventSignal, on, onMap, once } from "./event.ts";
import { owned } from "./utils.ts";

const el = (): HTMLDivElement => document.createElement("div");

describe("on", () => {
  test("binds and unbinds through the returned function", () => {
    const target = el();
    let calls = 0;
    const clear = on(target, "click", () => calls++);
    target.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
    clear();
    target.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
  });

  test("unbinds when the owner disposes", () => {
    const target = el();
    let calls = 0;
    const dispose = createRoot((d) => {
      on(target, "click", () => calls++);
      return d;
    });
    target.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
    dispose();
    target.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
  });

  test("binds every type in an array", () => {
    const target = el();
    const seen: string[] = [];
    const clear = on(target, ["mousedown", "touchstart"], (e) => seen.push(e.type));
    target.dispatchEvent(new Event("mousedown"));
    target.dispatchEvent(new Event("touchstart"));
    expect(seen).toEqual(["mousedown", "touchstart"]);
    clear();
    target.dispatchEvent(new Event("mousedown"));
    expect(seen).toHaveLength(2);
  });

  test("rebinds when a reactive target changes", () => {
    const a = el();
    const b = el();
    const [target, setTarget] = createSignal<HTMLDivElement | null>(null);
    let calls = 0;
    const dispose = createRoot((d) => {
      on(target, "click", () => calls++);
      return d;
    });

    a.dispatchEvent(new Event("click"));
    expect(calls).toBe(0);

    setTarget(a);
    flush();
    a.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);

    setTarget(b);
    flush();
    a.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
    b.dispatchEvent(new Event("click"));
    expect(calls).toBe(2);

    dispose();
    b.dispatchEvent(new Event("click"));
    expect(calls).toBe(2);
  });

  test("rebinds when a reactive type changes", () => {
    const target = el();
    const [type, setType] = createSignal<"click" | "focus">("click");
    const seen: string[] = [];
    const dispose = createRoot((d) => {
      on(target, type, (e) => seen.push(e.type));
      return d;
    });
    target.dispatchEvent(new Event("click"));
    setType("focus");
    flush();
    target.dispatchEvent(new Event("click"));
    target.dispatchEvent(new Event("focus"));
    expect(seen).toEqual(["click", "focus"]);
    dispose();
  });

  test("runs the handler with no ambient owner, and under the binding one through owned", () => {
    const target = el();
    let bare: unknown = "unset";
    let bound: unknown = "unset";
    const [dispose, owner] = createRoot((d) => {
      on(target, "click", () => {
        bare = getOwner();
      });
      on(
        target,
        "click",
        owned(() => {
          bound = getOwner();
        }),
      );
      return [d, getOwner()] as const;
    });
    target.dispatchEvent(new Event("click"));
    expect(bare).toBe(null);
    expect(owner).not.toBe(null);
    expect(bound).toBe(owner);
    dispose();
  });
});

describe("error routing", () => {
  test("a throw from a handler reaches the enclosing boundary", () => {
    const target = el();
    const host = el();
    const seen: unknown[] = [];

    const dispose = render(
      () =>
        boundary(
          host,
          null,
          "error",
          (error: () => unknown) => {
            seen.push(error());
            return document.createTextNode("fallback");
          },
          () => {
            on(target, "click", () => {
              throw new Error("from the handler");
            });
            return document.createTextNode("content");
          },
        ),
      host,
    );

    expect(host.textContent).toBe("content");
    target.dispatchEvent(new Event("click"));
    flush();

    expect(host.textContent).toBe("fallback");
    expect(seen).toHaveLength(1);
    expect((seen[0] as Error).message).toBe("from the handler");
    dispose();
  });
});

describe("eventSignal", () => {
  test("publishes the latest event, and a repeat of the same one is a new update", () => {
    const target = el();
    const seen: (string | undefined)[] = [];
    const dispose = createRoot((d) => {
      const last = eventSignal(target, "click");
      expect(last()).toBeUndefined();
      createTrackedEffect(() => {
        seen.push(last()?.type);
      });
      flush();

      target.dispatchEvent(new Event("click"));
      flush();
      expect(last()?.type).toBe("click");

      target.dispatchEvent(new Event("click"));
      flush();
      return d;
    });
    // Two identical events are two updates, not one.
    expect(seen).toEqual([undefined, "click", "click"]);
    dispose();
  });
});

describe("onMap", () => {
  test("binds several types and clears them together", () => {
    const target = el();
    const seen: string[] = [];
    const clear = onMap(target, {
      click: () => seen.push("click"),
      focus: () => seen.push("focus"),
    });
    target.dispatchEvent(new Event("click"));
    target.dispatchEvent(new Event("focus"));
    expect(seen).toEqual(["click", "focus"]);
    clear();
    target.dispatchEvent(new Event("click"));
    expect(seen).toHaveLength(2);
  });
});

describe("once", () => {
  test("fires exactly once and unbinds", () => {
    const target = el();
    let calls = 0;
    once(target, "click", () => calls++);
    target.dispatchEvent(new Event("click"));
    target.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
  });

  test("survives a rebind without rearming", () => {
    const a = el();
    const b = el();
    const [target, setTarget] = createSignal<HTMLDivElement>(a);
    let calls = 0;
    const dispose = createRoot((d) => {
      once(target, "click", () => calls++);
      return d;
    });
    a.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
    setTarget(b);
    flush();
    b.dispatchEvent(new Event("click"));
    expect(calls).toBe(1);
    dispose();
  });
});
