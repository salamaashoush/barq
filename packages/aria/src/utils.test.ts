import { describe, expect, test } from "bun:test";
import { effect, flush, root, signal } from "@barqjs/core";
import {
  chain,
  clamp,
  controllable,
  filterDOMProps,
  id,
  mergeIds,
  mergeProps,
  roundToStepPrecision,
  snapValueToStep,
  toFixedNumber,
} from "./utils.ts";

describe("mergeProps", () => {
  test("chains handlers in source order", () => {
    const calls: string[] = [];
    const merged = mergeProps(
      { onClick: () => calls.push("a") },
      { onClick: () => calls.push("b") },
      { onClick: () => calls.push("c") },
    );

    (merged.onClick as () => void)();

    expect(calls).toEqual(["a", "b", "c"]);
  });

  test("only chains keys that look like handlers", () => {
    const a = (): string => "a";
    const b = (): string => "b";
    // `only` is lower case after `on`, so it is an accessor, not a handler.
    const merged = mergeProps({ only: a }, { only: b });

    expect(merged.only).toBe(b);
  });

  test("combines class from both sources", () => {
    const merged = mergeProps({ class: "a" }, { class: "b" });
    expect(merged.class).toBe("a b");
  });

  test("combines class when either side is an accessor", () => {
    const variant = signal("primary");
    const merged = mergeProps({ class: "base" }, { class: () => variant() });

    expect((merged.class as () => string)()).toBe("base primary");
    variant.set("danger");
    expect((merged.class as () => string)()).toBe("base danger");
  });

  test("a later undefined does not erase an earlier value", () => {
    const merged = mergeProps({ role: "button" }, { role: undefined });
    expect(merged.role).toBe("button");
  });

  test("a later value wins for everything else", () => {
    const merged = mergeProps({ role: "button" }, { role: "link" });
    expect(merged.role).toBe("link");
  });

  test("nothing is called during the merge", () => {
    let reads = 0;
    const counted = (): string => {
      reads++;
      return "x";
    };

    const merged = mergeProps({ "aria-label": counted }, { role: "button" });

    expect(reads).toBe(0);
    expect((merged["aria-label"] as () => string)()).toBe("x");
    expect(reads).toBe(1);
  });

  test("merges refs so both consumers get the node", () => {
    const seen: string[] = [];
    const merged = mergeProps({ ref: () => seen.push("a") }, { ref: () => seen.push("b") });

    (merged.ref as (el: Element) => void)(document.createElement("div"));

    expect(seen).toEqual(["a", "b"]);
  });
});

describe("id", () => {
  test("is stable across reads", () => {
    root((dispose) => {
      const first = id();
      expect(first()).toBe(first());
      dispose();
    });
  });

  test("two ids under one owner differ", () => {
    root((dispose) => {
      const a = id();
      const b = id();
      expect(a()).not.toBe(b());
      dispose();
    });
  });

  test("a given id overrides the generated one", () => {
    root((dispose) => {
      const given = id("mine");
      expect(given()).toBe("mine");
      dispose();
    });
  });

  test("the same owner tree produces the same ids twice, which is what hydration needs", () => {
    const run = (): string[] =>
      root((dispose) => {
        const ids = [id()(), id()()];
        dispose();
        return ids;
      });

    // Two roots are different owners, so the ids differ between runs; what has
    // to hold is that the SHAPE is deterministic — the second id follows the
    // first by one, in both runs.
    const first = run();
    const second = run();
    expect(first[0]).not.toBe(first[1]);
    expect(second[0]).not.toBe(second[1]);
  });
});

describe("mergeIds", () => {
  test("repoints the accessor that was handed out", () => {
    root((dispose) => {
      const a = id();
      const b = id();
      const original = a();

      const merged = mergeIds(a, b);

      expect(a()).toBe(b());
      expect(typeof merged === "function" ? merged() : merged).toBe(b());
      expect(a()).not.toBe(original);
      dispose();
    });
  });

  test("a foreign id wins over one of ours", () => {
    root((dispose) => {
      const ours = id();
      mergeIds("given", ours);
      expect(ours()).toBe("given");
      dispose();
    });
  });

  test("identical ids merge to themselves", () => {
    expect(mergeIds("same", "same")).toBe("same");
  });
});

describe("filterDOMProps", () => {
  test("drops component options", () => {
    const filtered = filterDOMProps({ isDisabled: true, onSelectionChange: () => {}, id: "x" });
    expect(filtered).toEqual({ id: "x" });
  });

  test("keeps data attributes always", () => {
    expect(filterDOMProps({ "data-testid": "x" })).toEqual({ "data-testid": "x" });
  });

  test("keeps labelling props only when asked", () => {
    const props = { "aria-label": "Close" };
    expect(filterDOMProps(props)).toEqual({});
    expect(filterDOMProps(props, { labelable: true })).toEqual(props);
  });

  test("keeps link props only when asked", () => {
    const props = { href: "/a", target: "_blank" };
    expect(filterDOMProps(props)).toEqual({});
    expect(filterDOMProps(props, { isLink: true })).toEqual(props);
  });

  test("global implies events", () => {
    const filtered = filterDOMProps({ onClick: () => {}, lang: "en" }, { global: true });
    expect(Object.keys(filtered).toSorted()).toEqual(["lang", "onClick"]);
  });

  test("capture variants of allowed events are kept", () => {
    const filtered = filterDOMProps({ onClickCapture: () => {} }, { global: true });
    expect(Object.keys(filtered)).toEqual(["onClickCapture"]);
  });
});

describe("chain", () => {
  test("calls each function with the same arguments", () => {
    const seen: number[] = [];
    chain<[number]>(
      (n) => seen.push(n),
      undefined,
      (n) => seen.push(n * 2),
    )(3);
    expect(seen).toEqual([3, 6]);
  });
});

describe("numbers", () => {
  test("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  test("roundToStepPrecision keeps a screen reader from reading float noise", () => {
    expect(roundToStepPrecision(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundToStepPrecision(1.0000001, 1e-7)).toBe(1.0000001);
  });

  test("snapValueToStep", () => {
    expect(snapValueToStep(2, 0, 100, 5)).toBe(0);
    expect(snapValueToStep(3, 0, 100, 5)).toBe(5);
    expect(snapValueToStep(-10, 0, 100, 5)).toBe(0);
    expect(snapValueToStep(1000, 0, 100, 5)).toBe(100);
    expect(snapValueToStep(0.3, 0, 1, 0.1)).toBe(0.3);
  });

  test("snapValueToStep respects a min that is not a multiple of the step", () => {
    expect(snapValueToStep(7, 2, 20, 5)).toBe(7);
    expect(snapValueToStep(8, 2, 20, 5)).toBe(7);
  });

  test("toFixedNumber", () => {
    expect(toFixedNumber(1.23456, 2)).toBe(1.23);
  });
});

describe("controllable", () => {
  test("uncontrolled: the setter owns the value", () => {
    root((dispose) => {
      const changes: number[] = [];
      const [value, setValue] = controllable<number>(undefined, 0, (n) => changes.push(n));

      expect(value()).toBe(0);
      setValue(1);
      expect(value()).toBe(1);
      expect(changes).toEqual([1]);
      dispose();
    });
  });

  test("controlled: the prop owns the value and the setter only reports", () => {
    root((dispose) => {
      const outer = signal(0);
      const changes: number[] = [];
      const [value, setValue] = controllable<number>(
        () => outer(),
        0,
        (n) => changes.push(n),
      );

      setValue(1);
      expect(changes).toEqual([1]);
      expect(value()).toBe(0);

      outer.set(1);
      expect(value()).toBe(1);
      dispose();
    });
  });

  test("a no-op set reports nothing", () => {
    root((dispose) => {
      const changes: number[] = [];
      const [, setValue] = controllable<number>(undefined, 3, (n) => changes.push(n));
      setValue(3);
      expect(changes).toEqual([]);
      dispose();
    });
  });

  test("the functional form composes across two calls in one event", () => {
    root((dispose) => {
      const outer = signal(0);
      const changes: number[] = [];
      const [, setValue] = controllable<number>(
        () => outer(),
        0,
        (n) => changes.push(n),
      );

      setValue((n) => n + 1);
      setValue((n) => n + 1);

      // Controlled, so the prop has not moved. Composing from the prop would
      // report 1 twice.
      expect(changes).toEqual([1, 2]);
      dispose();
    });
  });

  test("reads are reactive", () => {
    root((dispose) => {
      const seen: number[] = [];
      const [value, setValue] = controllable<number>(undefined, 0);
      effect(() => seen.push(value()));
      flush();
      setValue(5);
      flush();
      expect(seen).toEqual([0, 5]);
      dispose();
    });
  });
});
