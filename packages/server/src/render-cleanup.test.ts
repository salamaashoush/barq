/**
 * Per-request state ends with the request, however the request ends.
 *
 * A render that throws releases what a render that finishes releases, and a
 * fetch that answers after its render has ended has nowhere to put the answer.
 */

import { createMemo, onCleanup } from "@barqjs/core";
import { getHydrationData, pendingSeedsOf, clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderPage, renderToStream, renderToString } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  clearHydrationData();
});

const defer = (value: () => unknown): string =>
  esc(
    ssrLoading({
      fallback: () => html("<i>skel</i>"),
      children: () => html(`<b>${esc(value())}</b>`),
    }),
  );

test("renderToString disposes its root when the page throws", () => {
  let cleaned = 0;

  expect(() =>
    renderToString(() => {
      onCleanup(() => cleaned++);
      throw new Error("no such page");
    }),
  ).toThrow("no such page");

  expect(cleaned).toBe(1);
});

test("renderPage releases the render when a resumed boundary throws", async () => {
  const session = Symbol("render");
  let cleaned = 0;

  const failed = renderPage(
    () => {
      onCleanup(() => cleaned++);
      const ok = createMemo(async () => "a large payload", { key: "ok" });
      const bad = createMemo(
        async () => {
          await tick();
          throw new Error("boom");
        },
        { key: "bad" },
      );
      return html(`<main>${defer(ok)}${defer(bad)}</main>`);
    },
    { session },
  );

  await expect(failed).rejects.toThrow("boom");
  expect({
    cleaned,
    recorded: getHydrationData(session),
    pending: Object.keys(pendingSeedsOf(session)),
  }).toEqual({ cleaned: 1, recorded: {}, pending: [] });
});

test("renderToStream releases the render when the shell throws", () => {
  const session = Symbol("render");
  let cleaned = 0;

  expect(() =>
    renderToStream(
      () => {
        onCleanup(() => cleaned++);
        createMemo(async () => "a large payload", { key: "ok" });
        throw new Error("no such page");
      },
      { session },
    ),
  ).toThrow("no such page");

  expect({ cleaned, pending: Object.keys(pendingSeedsOf(session)) }).toEqual({
    cleaned: 1,
    pending: [],
  });
});

test("a fetch that answers after its stream was aborted is not kept", async () => {
  const session = Symbol("render");
  const controller = new AbortController();

  const stream = renderToStream(
    () => {
      const slow = createMemo(
        async () => {
          await wait(40);
          return "a late payload";
        },
        { key: "slow" },
      );
      return html(`<main>${defer(slow)}</main>`);
    },
    { session, signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 5);
  const reader = stream.getReader();
  while (!(await reader.read()).done);

  expect(getHydrationData(session)).toEqual({});
  await wait(80);
  expect(getHydrationData(session)).toEqual({});
});
