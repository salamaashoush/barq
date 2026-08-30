import { describe, expect, test } from "bun:test";
import { flush, root } from "@barqjs/core";
import { isKeyDown, keysDown, parseCombo, shortcut } from "./keyboard.ts";

const key = (init: KeyboardEventInit & { key: string }, type = "keydown") =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));

describe("keysDown", () => {
  test("tracks presses and releases, and clears on blur", () => {
    const dispose = root((d) => {
      const held = keysDown();
      expect(held()).toEqual([]);

      key({ key: "A" });
      expect(held()).toEqual(["a"]);
      key({ key: "a" });
      expect(held()).toEqual(["a"]);
      key({ key: "Shift" });
      expect(held()).toEqual(["a", "shift"]);

      key({ key: "A" }, "keyup");
      expect(held()).toEqual(["shift"]);

      window.dispatchEvent(new Event("blur"));
      expect(held()).toEqual([]);
      return d;
    });
    dispose();
  });

  test("ignores auto-repeat", () => {
    const dispose = root((d) => {
      const held = keysDown();
      key({ key: "b" });
      key({ key: "b", repeat: true });
      expect(held()).toEqual(["b"]);
      key({ key: "b" }, "keyup");
      return d;
    });
    dispose();
  });
});

describe("isKeyDown", () => {
  test("reports one key", () => {
    const dispose = root((d) => {
      const down = isKeyDown("Escape");
      expect(down()).toBe(false);
      key({ key: "Escape" });
      flush();
      expect(down()).toBe(true);
      key({ key: "Escape" }, "keyup");
      flush();
      expect(down()).toBe(false);
      return d;
    });
    dispose();
  });
});

describe("parseCombo", () => {
  test("splits modifiers from the key", () => {
    expect(parseCombo("ctrl+shift+k")).toEqual({
      key: "k",
      ctrl: true,
      meta: false,
      shift: true,
      alt: false,
    });
    expect(parseCombo("Escape")).toEqual({
      key: "escape",
      ctrl: false,
      meta: false,
      shift: false,
      alt: false,
    });
  });

  test("mod is one of control or meta, never both", () => {
    const parsed = parseCombo("mod+s");
    expect(parsed.ctrl !== parsed.meta).toBe(true);
  });
});

describe("shortcut", () => {
  test("fires on an exact modifier match", () => {
    let calls = 0;
    const dispose = root((d) => {
      shortcut("ctrl+k", () => calls++);
      return d;
    });

    key({ key: "k" });
    expect(calls).toBe(0);
    key({ key: "k", ctrlKey: true, shiftKey: true });
    expect(calls).toBe(0);
    key({ key: "k", ctrlKey: true });
    expect(calls).toBe(1);
    dispose();
  });

  test("prevents the default unless told not to", () => {
    const dispose = root((d) => {
      shortcut("ctrl+p", () => {});
      shortcut("ctrl+q", () => {}, { preventDefault: false });
      return d;
    });

    const prevented = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, cancelable: true });
    window.dispatchEvent(prevented);
    expect(prevented.defaultPrevented).toBe(true);

    const allowed = new KeyboardEvent("keydown", { key: "q", ctrlKey: true, cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
    dispose();
  });

  test("a bare key is suppressed while typing, a modified one is not", () => {
    const input = document.createElement("input");
    document.body.append(input);
    let bare = 0;
    let modified = 0;
    const dispose = root((d) => {
      shortcut("j", () => bare++);
      shortcut("ctrl+j", () => modified++);
      return d;
    });

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(bare).toBe(0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }));
    expect(modified).toBe(1);

    key({ key: "j" });
    expect(bare).toBe(1);
    input.remove();
    dispose();
  });

  test("auto-repeat is ignored unless asked for", () => {
    let held = 0;
    let repeated = 0;
    const dispose = root((d) => {
      shortcut("ctrl+u", () => held++);
      shortcut("ctrl+i", () => repeated++, { repeat: true });
      return d;
    });
    key({ key: "u", ctrlKey: true, repeat: true });
    key({ key: "i", ctrlKey: true, repeat: true });
    expect(held).toBe(0);
    expect(repeated).toBe(1);
    dispose();
  });

  test("unbinds with its owner", () => {
    let calls = 0;
    const dispose = root((d) => {
      shortcut("ctrl+z", () => calls++);
      return d;
    });
    key({ key: "z", ctrlKey: true });
    expect(calls).toBe(1);
    dispose();
    key({ key: "z", ctrlKey: true });
    expect(calls).toBe(1);
  });
});
