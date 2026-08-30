import { describe, expect, test } from "bun:test";
import { flush, root, signal } from "@barqjs/core";
import { documentTitle, languages, online, pageVisible, userIdle } from "./browser.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Wait for a condition rather than a duration; a loaded machine runs timers late. */
async function eventually(predicate: () => boolean, what: string, deadline = 2000): Promise<void> {
  const until = Date.now() + deadline;
  while (Date.now() < until) {
    if (predicate()) return;
    await sleep(5);
  }
  throw new Error(`timed out after ${deadline}ms waiting for ${what}`);
}

describe("online", () => {
  test("follows the online and offline events, from one shared source", () => {
    const dispose = root((d) => {
      const connected = online();
      expect(connected).toBe(online());
      window.dispatchEvent(new Event("offline"));
      expect(connected()).toBe(false);
      window.dispatchEvent(new Event("online"));
      expect(connected()).toBe(true);
      return d;
    });
    dispose();
  });
});

describe("pageVisible", () => {
  test("reads the visibility state on change", () => {
    const dispose = root((d) => {
      const visible = pageVisible();
      expect(visible()).toBe(true);
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(visible()).toBe(false);
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(visible()).toBe(true);
      return d;
    });
    dispose();
  });
});

describe("userIdle", () => {
  test("goes idle after the timeout and wakes on input", async () => {
    const dispose = root((d) => {
      const idle = userIdle({ after: 20 });
      return [d, idle] as const;
    });
    expect(dispose[1]()).toBe(false);
    await eventually(() => dispose[1](), "the idle timeout");

    document.dispatchEvent(new Event("keydown"));
    expect(dispose[1](), "input did not wake it").toBe(false);
    dispose[0]();
  });

  test("a hidden tab is idle at once", () => {
    const dispose = root((d) => {
      const idle = userIdle({ after: 10_000 });
      expect(idle()).toBe(false);
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(idle()).toBe(true);

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(idle()).toBe(false);
      return d;
    });
    dispose();
  });

  test("stops its timer with the owner", async () => {
    let idle!: () => boolean;
    const dispose = root((d) => {
      idle = userIdle({ after: 20 });
      return d;
    });
    dispose();
    await sleep(80);
    expect(idle(), "the idle timer outlived its owner").toBe(false);
  });
});

describe("documentTitle", () => {
  test("sets the title and puts the old one back", () => {
    document.title = "before";
    const heading = signal("first");
    const dispose = root((d) => {
      documentTitle(heading);
      expect(document.title).toBe("first");
      heading.set("second");
      flush();
      expect(document.title).toBe("second");
      return d;
    });
    dispose();
    expect(document.title).toBe("before");
  });
});

describe("languages", () => {
  test("reads navigator.languages and follows languagechange", () => {
    const dispose = root((d) => {
      const preferred = languages();
      expect(preferred().length).toBeGreaterThan(0);
      window.dispatchEvent(new Event("languagechange"));
      expect(preferred()).toEqual(navigator.languages);
      return d;
    });
    dispose();
  });
});
