import { afterEach, beforeAll, describe, expect, test } from "bun:test";

import {
  decodeUrlState,
  encodeUrlState,
  readUrlState,
  urlStateLink,
  writeUrlState,
} from "./url-state.ts";

const WORKSPACE = {
  files: { "main.toy": "let total = 0\nfor n in 1..10 { total += n }\nprint total\n".repeat(20) },
  open: ["main.toy"],
  cursor: { line: 3, column: 7 },
  unicode: "سلام, café, 🙂",
};

interface HappyWindow {
  happyDOM: HappyDom;
}

interface HappyDom {
  setURL(url: string): void;
}

beforeAll(() => {
  (window as unknown as HappyWindow).happyDOM.setURL("http://localhost/");
});

afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("encodeUrlState and decodeUrlState", () => {
  test("round-trip a value through base64url, smaller than its JSON when it repeats", async () => {
    const encoded = await encodeUrlState(WORKSPACE);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(JSON.stringify(WORKSPACE).length);
    expect(await decodeUrlState(encoded)).toEqual(WORKSPACE);
  });

  test("carry every scalar JSON has", async () => {
    for (const value of [null, 0, -1.5, true, "", "a/b+c=d", [], {}]) {
      expect(await decodeUrlState(await encodeUrlState(value))).toEqual(value);
    }
  });

  test("a value with no JSON form, or one with a cycle, is refused", async () => {
    await expect(encodeUrlState(undefined)).rejects.toThrow(TypeError);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    await expect(encodeUrlState(cycle)).rejects.toThrow();
  });

  test("text cut short or edited by hand is refused", async () => {
    const encoded = await encodeUrlState(WORKSPACE);
    await expect(decodeUrlState(encoded.slice(0, 12))).rejects.toThrow();
    await expect(decodeUrlState("!!not base64!!")).rejects.toThrow();
  });
});

describe("the page's hash", () => {
  test("writeUrlState puts the state under its key, keeping the hash's other parameters", async () => {
    history.replaceState(null, "", "/play?lang=toy#theme=dark");
    const before = history.length;
    const href = await writeUrlState(WORKSPACE, { key: "s" });
    expect(location.href).toBe(href);
    expect(location.pathname).toBe("/play");
    expect(location.search).toBe("?lang=toy");
    const params = new URLSearchParams(location.hash.slice(1));
    expect(params.get("theme")).toBe("dark");
    expect(params.get("s")).not.toBeNull();
    expect(history.length).toBe(before);
    expect(await readUrlState({ key: "s" })).toEqual(WORKSPACE);
  });

  test("push adds a history entry", async () => {
    const before = history.length;
    await writeUrlState({ a: 1 }, { history: "push" });
    expect(history.length).toBe(before + 1);
    expect(await readUrlState()).toEqual({ a: 1 });
  });

  test("readUrlState is undefined with no state, or with state that does not decode", async () => {
    expect(await readUrlState()).toBeUndefined();
    history.replaceState(null, "", "/#state=garbage");
    expect(await readUrlState()).toBeUndefined();
    history.replaceState(null, "", "/#state=");
    expect(await readUrlState()).toBeUndefined();
  });

  test("urlStateLink builds a link to another page without touching this one", async () => {
    history.replaceState(null, "", "/here");
    const link = await urlStateLink([1, 2, 3], { base: "https://play.example.com/p?x=1" });
    expect(location.pathname).toBe("/here");
    const url = new URL(link);
    expect(url.origin + url.pathname + url.search).toBe("https://play.example.com/p?x=1");
    const encoded = new URLSearchParams(url.hash.slice(1)).get("state") ?? "";
    expect(await decodeUrlState(encoded)).toEqual([1, 2, 3]);
  });
});
