/**
 * Renders in flight at the same time share one module graph and one flush.
 *
 * Two things follow, and both are about whose a value is. A value two renders
 * wait on was declared by one of them, and the other has to wait for it all the
 * same. And a value one render declared stays that render's, whichever render's
 * flush happens to recompute it.
 */

import { createMemo, createRoot, createSignal, getOwner, lazy, runWithOwner } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, expect, test } from "bun:test";

import { renderPage, renderToStream } from "./server.ts";
import { esc, html, ssrLoading } from "./ssr.ts";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

afterEach(() => {
  clearHydrationData();
});

/**
 * `lazy()` keeps one memo for the life of the process and declares it on first
 * use, so its flight belongs to whichever render got there first.
 */
function coldRoute(): () => unknown {
  const Route = lazy(async () => {
    await wait(10);
    return { default: () => html("<b>ROUTE</b>") };
  }) as unknown as (props: unknown) => unknown;
  return () =>
    html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html("<i>pending</i>"),
          children: () => Route({}),
        }),
      )}</main>`,
    );
}

test("two buffered renders of a cold lazy route both get the route", async () => {
  const page = coldRoute();

  const [first, second] = await Promise.all([renderPage(page as never), renderPage(page as never)]);

  expect(first.html).toBe("<main><b>ROUTE</b></main>");
  expect(second.html).toBe("<main><b>ROUTE</b></main>");
});

test("two streams of a cold lazy route both get the route", async () => {
  const page = coldRoute();

  const [first, second] = await Promise.all([
    collect(renderToStream(page as never)),
    collect(renderToStream(page as never)),
  ]);

  expect(first).toContain("<b>ROUTE</b>");
  expect(second).toContain("<b>ROUTE</b>");
});

test("a recompute flushed during another render stays in its own render's seed", async () => {
  let selectAccount!: (id: number) => void;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = renderPage(() => {
    const [account, setAccount] = createSignal(1);
    selectAccount = setAccount;
    const held = createMemo(() => gate.then(() => "ready"), { key: "held" });
    const profile = createMemo(async () => `private-profile-${account()}`, { key: "profile" });
    return html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html("<i>loading</i>"),
          children: () => html(`<b>${esc(held())} ${esc(profile())}</b>`),
        }),
      )}</main>`,
    );
  });

  await tick();
  // A write from the first request's own continuation, staged until a flush.
  selectAccount(2);
  // A second request starts before that flush has run.
  const second = renderPage(() => html("<main>another visitor</main>"));
  release();

  const [mine, theirs] = await Promise.all([first, second]);

  expect(theirs.data).toEqual({});
  expect(theirs.script).not.toContain("private-profile");
  expect(mine.html).toBe("<main><b>ready private-profile-2</b></main>");
  expect(mine.data.profile).toBe("private-profile-2");
});

/**
 * A read declared for an account when the account is chosen: under the compute
 * that chose it, or under a root of its own the way a cache keeps its entries.
 */
const declarations = {
  "under the compute": (id: number) =>
    createMemo(async () => `private-profile-${id}`, { key: `profile-${id}` }),
  "under a root of its own": (id: number) =>
    runWithOwner(null, () =>
      createRoot(() => createMemo(async () => `private-profile-${id}`, { key: `profile-${id}` })),
    ),
};

for (const [where, declare] of Object.entries(declarations)) {
  test(`a read declared ${where} during another render's flush is not seeded into it`, async () => {
    let selectAccount!: (id: number) => void;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = renderPage(() => {
      const [account, setAccount] = createSignal(1);
      selectAccount = setAccount;
      const held = createMemo(() => gate.then(() => "ready"), { key: "held" });
      const profile = createMemo(() => declare(account()));
      return html(
        `<main>${esc(
          ssrLoading({
            fallback: () => html("<i>loading</i>"),
            children: () => html(`<b>${esc(held())} ${esc(profile()())}</b>`),
          }),
        )}</main>`,
      );
    });

    await tick();
    selectAccount(2);
    const second = renderPage(() => html("<main>another visitor</main>"));
    release();

    const [mine, theirs] = await Promise.all([first, second]);

    expect(theirs.data).toEqual({});
    expect(theirs.script).not.toContain("private-profile");
    expect(mine.html).toBe("<main><b>ready private-profile-2</b></main>");
    expect(mine.data["profile-2"]).toBe("private-profile-2");
  });
}

test("a read declared under one render's owner while another render builds stays the first's", async () => {
  let declareLate!: () => void;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const first = renderPage(() => {
    const owner = getOwner();
    declareLate = () => {
      runWithOwner(owner, () => createMemo(async () => "private-late", { key: "late" }));
    };
    const held = createMemo(() => gate.then(() => "ready"), { key: "held" });
    return html(
      `<main>${esc(
        ssrLoading({
          fallback: () => html("<i>loading</i>"),
          children: () => html(`<b>${esc(held())}</b>`),
        }),
      )}</main>`,
    );
  });

  await tick();
  const second = renderPage(() => {
    declareLate();
    return html("<main>another visitor</main>");
  });
  release();

  const [mine, theirs] = await Promise.all([first, second]);

  expect(theirs.data).toEqual({});
  expect(mine.data.late).toBe("private-late");
});
