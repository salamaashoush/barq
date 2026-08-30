import { afterEach, describe, expect, test } from "bun:test";
import { root } from "@barqjs/core";
import { clipboard, readClipboard, writeClipboard } from "./clipboard.ts";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const real = navigator.clipboard;

function stub(impl: Partial<Clipboard>): void {
  Object.defineProperty(navigator, "clipboard", { value: impl, configurable: true });
}

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: real, configurable: true });
});

describe("writeClipboard / readClipboard", () => {
  test("delegate to the platform", async () => {
    let written = "";
    stub({
      writeText: async (text: string) => {
        written = text;
      },
      readText: async () => "from the board",
    });
    await writeClipboard("hello");
    expect(written).toBe("hello");
    await expect(readClipboard()).resolves.toBe("from the board");
  });

  test("reject where the API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await expect(writeClipboard("x")).rejects.toThrow("unavailable");
    await expect(readClipboard()).rejects.toThrow("unavailable");
  });
});

describe("clipboard", () => {
  test("raises copied and lowers it again", async () => {
    stub({ writeText: async () => {} });
    const dispose = root((d) => {
      const board = clipboard({ resetAfter: 20 });
      return [d, board] as const;
    });
    const board = dispose[1];

    expect(board.copied()).toBe(false);
    await board.copy("text");
    expect(board.copied()).toBe(true);
    expect(board.error()).toBeUndefined();

    await sleep(40);
    expect(board.copied()).toBe(false);
    dispose[0]();
  });

  test("records a refusal and does not claim success", async () => {
    stub({
      writeText: async () => {
        throw new Error("NotAllowedError");
      },
    });
    const dispose = root((d) => {
      const board = clipboard();
      return [d, board] as const;
    });
    const board = dispose[1];

    await expect(board.copy("text")).rejects.toThrow("NotAllowedError");
    expect(board.copied()).toBe(false);
    expect(board.error()).toBeInstanceOf(Error);
    dispose[0]();
  });

  test("resetAfter 0 keeps the flag raised", async () => {
    stub({ writeText: async () => {} });
    const dispose = root((d) => {
      const board = clipboard({ resetAfter: 0 });
      return [d, board] as const;
    });
    await dispose[1].copy("text");
    await sleep(20);
    expect(dispose[1].copied()).toBe(true);
    dispose[0]();
  });
});
