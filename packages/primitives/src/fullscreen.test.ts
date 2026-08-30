import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { fullscreen, fullscreenElement } from "./fullscreen.ts";

let current: Element | null = null;
const requested: Element[] = [];
let exits = 0;

beforeEach(() => {
  current = null;
  requested.length = 0;
  exits = 0;
  Object.defineProperty(document, "fullscreenElement", {
    get: () => current,
    configurable: true,
  });
  document.exitFullscreen = async () => {
    current = null;
    exits++;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
});

afterEach(() => {
  current = null;
});

/** An element whose `requestFullscreen` drives the same document state Chrome would. */
const el = () => {
  const node = document.createElement("div");
  node.requestFullscreen = async () => {
    requested.push(node);
    current = node;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  document.body.append(node);
  return node;
};

// The document element is a target too, for the no-argument form.
document.documentElement.requestFullscreen = async () => {
  requested.push(document.documentElement);
  current = document.documentElement;
  document.dispatchEvent(new Event("fullscreenchange"));
};

describe("fullscreen", () => {
  test("enter and exit move the state", async () => {
    const target = el();
    const dispose = root((d) => {
      const fs = fullscreen(target);
      expect(fs.active()).toBe(false);
      return [d, fs] as const;
    });

    await dispose[1].enter();
    expect(requested).toEqual([target]);
    expect(dispose[1].active()).toBe(true);

    await dispose[1].exit();
    expect(exits).toBe(1);
    expect(dispose[1].active()).toBe(false);
    dispose[0]();
    target.remove();
  });

  test("active follows the document, so Escape is seen", async () => {
    const target = el();
    const dispose = root((d) => {
      const fs = fullscreen(target);
      return [d, fs] as const;
    });

    await dispose[1].enter();
    expect(dispose[1].active()).toBe(true);

    // What Escape does: the browser leaves fullscreen and fires the event.
    // No promise ever resolves for this, which is why the state cannot be
    // derived from `enter`/`exit` alone.
    current = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(dispose[1].active()).toBe(false);
    dispose[0]();
    target.remove();
  });

  test("another element being fullscreen is not this one being fullscreen", async () => {
    const mine = el();
    const other = el();
    const dispose = root((d) => {
      const fs = fullscreen(mine);
      return [d, fs] as const;
    });

    await other.requestFullscreen();
    expect(dispose[1].active()).toBe(false);
    expect(fullscreenElement()()).toBe(other);
    dispose[0]();
    mine.remove();
    other.remove();
  });

  test("toggle goes both ways", async () => {
    const target = el();
    const dispose = root((d) => {
      const fs = fullscreen(target);
      return [d, fs] as const;
    });

    await dispose[1].toggle();
    expect(dispose[1].active()).toBe(true);
    await dispose[1].toggle();
    expect(dispose[1].active()).toBe(false);
    dispose[0]();
    target.remove();
  });

  test("with no target it means the document", async () => {
    const dispose = root((d) => {
      const fs = fullscreen();
      return [d, fs] as const;
    });
    await dispose[1].enter();
    expect(requested).toEqual([document.documentElement]);
    dispose[0]();
  });
});
