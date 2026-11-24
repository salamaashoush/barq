import { describe, expect, test } from "bun:test";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { importGraph } from "../test-graph.ts";

describe("what an app pays for the chat suite", () => {
  const src = dirname(dirname(fileURLToPath(import.meta.url)));
  const chat = join(src, "chat") + sep;

  test("arc's main entry reaches no file of the chat entry, and no emoji data", () => {
    const graph = importGraph(join(src, "index.ts"));
    expect([...graph.files].filter((file) => file.startsWith(chat))).toEqual([]);
    expect([...graph.packages.keys()].filter((name) => name.startsWith("emojibase"))).toEqual([]);
    expect(graph.packages.has("@lezer/markdown")).toBe(false);
  });

  test("the chat entry loads the emoji only when a picker asks", () => {
    const graph = importGraph(join(chat, "index.ts"));
    const emoji = [...graph.packages.entries()].filter(([name]) => name.startsWith("emojibase"));
    expect(emoji.length).toBeGreaterThan(0);
    for (const [, kinds] of emoji) expect([...kinds]).toEqual(["dynamic-import"]);
  });
});
