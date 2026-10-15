// oxlint-disable no-eval -- the swap and the seed are programs a page runs, and
// running them is the only way to know the minified bytes still work.

/**
 * What the published build ships for the swap and for seroval's helpers.
 *
 * Both are the text of a function, and a function's `toString()` is whatever
 * the runtime or the next bundler re-prints it as. `wire-text.config.ts`'s
 * `wireText` builds them minified and freezes that text into string literals;
 * this builds the same config into a scratch directory and runs what comes
 * out, because the workspace resolves `#swap` and `#serializer` to their
 * sources and nothing else here would ever execute the built copies.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { build } from "tsdown";

import { wireText } from "../wire-text.config.ts";
import { SWAP_SNIPPET as sourceSnippet } from "./swap.ts";

interface Serializer {
  crossSerializeStream: (
    value: unknown,
    options: { scopeId: string; onSerialize: (chunk: string) => void; onDone: () => void },
  ) => () => void;
  getCrossReferenceHeader: (scopeId: string) => string;
}

let out: string;
let snippet: string;
let minified: Serializer;
let installed: Serializer;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "barq-wire-text-"));
  await build({
    ...wireText,
    config: false,
    cwd: join(import.meta.dir, ".."),
    outDir: out,
    logLevel: "silent",
  });
  snippet = ((await import(join(out, "swap.js"))) as { SWAP_SNIPPET: string }).SWAP_SNIPPET;
  minified = await import(join(out, "serializer.js"));
  installed = await import("seroval");
});

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("the swap", () => {
  test("is minified text, and still has no `<` to end its script early", () => {
    expect(snippet).toStartWith("window.__BARQ_SWAP__=function");
    expect(snippet).not.toContain("\n");
    expect(snippet.length).toBeLessThan(sourceSnippet.length);
    expect(snippet).not.toContain("<");
  });

  test("swaps a deferred range when it runs as the page runs it", () => {
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML =
      '<p>a</p><!--[b:3--><i>skel</i><!--]--><p>z</p><template data-barq="3"><b>LATE</b></template>';
    (0, eval)(`${snippet}window.__BARQ_SWAP__(3)`);
    expect(host.innerHTML).toBe("<p>a</p><!--[--><b>LATE</b><!--]--><p>z</p>");
    host.remove();
  });
});

describe("seroval's helpers", () => {
  const seedOf = async (serializer: Serializer, scopeId: string): Promise<string> => {
    const chunks: string[] = [];
    await new Promise<void>((resolve) => {
      serializer.crossSerializeStream(
        { r00: Promise.resolve("LATE"), r01: Promise.reject(new Error("boom")) },
        { scopeId, onSerialize: (chunk) => chunks.push(chunk), onDone: resolve },
      );
    });
    return `${serializer.getCrossReferenceHeader(scopeId)};window.__SEED__=${chunks[0]};${chunks.slice(1).join(";")}`;
  };

  test("are minified text, smaller than the installed seroval's", async () => {
    const small = await seedOf(minified, "m0");
    const large = await seedOf(installed, "i0");
    expect(small).not.toContain("\n");
    expect(small.length).toBeLessThan(large.length);
  });

  test("still settle and stamp a promise the way the client reads it", async () => {
    (0, eval)(await seedOf(minified, "m1"));
    const seed = (globalThis as { __SEED__?: Record<string, { s?: number; v?: unknown }> })
      .__SEED__!;
    (seed.r01 as unknown as Promise<unknown>).catch(() => {});
    expect({ s: seed.r00.s, v: seed.r00.v }).toEqual({ s: 1, v: "LATE" });
    expect({ s: seed.r01.s, v: String(seed.r01.v) }).toEqual({ s: 2, v: "Error: boom" });
  });
});
