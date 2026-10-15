import { describe, expect, test } from "bun:test";
import { flush, createRoot } from "@barqjs/core";
import { isKeyDown, keysDown, parseCombo, shortcut } from "./keyboard.ts";

const key = (init: KeyboardEventInit & { key: string }, type = "keydown") =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }));
flush();

describe("keysDown", () => {
  test("tracks presses and releases, and clears on blur", () => {
    const dispose = createRoot((d) => {
      const held = keysDown();
      expect(held()).toEqual([]);

      key({ key: "A" });
      flush();
      expect(held()).toEqual(["a"]);
      key({ key: "a" });
      flush();
      expect(held()).toEqual(["a"]);
      key({ key: "Shift" });
      flush();
      expect(held()).toEqual(["a", "shift"]);

      key({ key: "A" }, "keyup");
      flush();
      expect(held()).toEqual(["shift"]);

      window.dispatchEvent(new Event("blur"));
      flush();
      expect(held()).toEqual([]);
      return d;
    });
    dispose();
  });

  test("ignores auto-repeat", () => {
    const dispose = createRoot((d) => {
      const held = keysDown();
      key({ key: "b" });
      flush();
      key({ key: "b", repeat: true });
      flush();
      expect(held()).toEqual(["b"]);
      key({ key: "b" }, "keyup");
      flush();
      return d;
    });
    dispose();
  });
});

describe("isKeyDown", () => {
  test("reports one key", () => {
    const dispose = createRoot((d) => {
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
    const dispose = createRoot((d) => {
      shortcut("ctrl+k", () => calls++);
      return d;
    });

    key({ key: "k" });
    flush();
    expect(calls).toBe(0);
    key({ key: "k", ctrlKey: true, shiftKey: true });
    flush();
    expect(calls).toBe(0);
    key({ key: "k", ctrlKey: true });
    flush();
    expect(calls).toBe(1);
    dispose();
  });

  test("prevents the default unless told not to", () => {
    const dispose = createRoot((d) => {
      shortcut("ctrl+p", () => {});
      shortcut("ctrl+q", () => {}, { preventDefault: false });
      return d;
    });

    const prevented = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, cancelable: true });
    window.dispatchEvent(prevented);
    flush();
    expect(prevented.defaultPrevented).toBe(true);

    const allowed = new KeyboardEvent("keydown", { key: "q", ctrlKey: true, cancelable: true });
    window.dispatchEvent(allowed);
    flush();
    expect(allowed.defaultPrevented).toBe(false);
    dispose();
  });

  test("a bare key is suppressed while typing, a modified one is not", () => {
    const input = document.createElement("input");
    document.body.append(input);
    let bare = 0;
    let modified = 0;
    const dispose = createRoot((d) => {
      shortcut("j", () => bare++);
      shortcut("ctrl+j", () => modified++);
      return d;
    });

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    flush();
    expect(bare).toBe(0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true }));
    flush();
    expect(modified).toBe(1);

    key({ key: "j" });
    flush();
    expect(bare).toBe(1);
    input.remove();
    dispose();
  });

  test("auto-repeat is ignored unless asked for", () => {
    let held = 0;
    let repeated = 0;
    const dispose = createRoot((d) => {
      shortcut("ctrl+u", () => held++);
      shortcut("ctrl+i", () => repeated++, { repeat: true });
      return d;
    });
    key({ key: "u", ctrlKey: true, repeat: true });
    flush();
    key({ key: "i", ctrlKey: true, repeat: true });
    flush();
    expect(held).toBe(0);
    expect(repeated).toBe(1);
    dispose();
  });

  test("unbinds with its owner", () => {
    let calls = 0;
    const dispose = createRoot((d) => {
      shortcut("ctrl+z", () => calls++);
      return d;
    });
    key({ key: "z", ctrlKey: true });
    flush();
    expect(calls).toBe(1);
    dispose();
    key({ key: "z", ctrlKey: true });
    flush();
    expect(calls).toBe(1);
  });
});
