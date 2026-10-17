import { HYDRATE, type Cell, createMemo, isDev, markSafeError } from "@barqjs/core";
import { clearHydrationData } from "@barqjs/core/internal";
import { afterEach, describe, expect, test } from "bun:test";

import { generateHydrationScript, renderPage, renderToStream } from "./server.ts";
import { type SsrHtml, boundary, esc, html } from "./ssr.ts";
import { expectOnly, printedBy } from "./test-console.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearHydrationData();
});

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

const showFailure = (error: Cell<unknown>): SsrHtml =>
  html(`<em>${esc((error() as Error).message)}</em>`);

function errored(body: () => SsrHtml): string {
  return esc(boundary(null, null, "error", showFailure, body, HYDRATE));
}

function loading(body: () => SsrHtml): string {
  return esc(boundary(null, null, "loading", () => html("<i>wait</i>"), body, HYDRATE));
}

function rejecting(error: Error): () => SsrHtml {
  return () => {
    const read = createMemo(
      async (): Promise<string> => {
        await tick();
        throw error;
      },
      { key: "account" },
    );
    return html(
      `<main>${errored(() => html(loading(() => html(`<b>${esc(read())}</b>`))))}</main>`,
    );
  };
}

const SECRET = "connection to db.example.com:5432 refused for salama";
const GENERIC = "Internal Server Error";

describe("generateHydrationScript", () => {
  test("is the bootstrap, and carries no render's data while two renders are in flight", async () => {
    const page = (name: string) => () => {
      const who = createMemo(
        async () => {
          await tick();
          return name;
        },
        { key: "who" },
      );
      return html(`<p>${loading(() => html(`<b>${esc(who())}</b>`))}</p>`);
    };

    const [first, second] = await Promise.all([
      renderPage(page("salama-first")),
      renderPage(page("salama-second")),
    ]);
    const boot = generateHydrationScript();

    expect(first.script).toContain("salama-first");
    expect(first.script).not.toContain("salama-second");
    expect(second.script).toContain("salama-second");
    expect(second.script).not.toContain("salama-first");
    expect(boot).not.toContain("salama-first");
    expect(boot).not.toContain("salama-second");
    expect(boot).not.toContain("__BARQ_DATA__");
    expect(boot).toContain("__BARQ_EVTS__");
  });

  test("takes Solid's options: a nonce and the events to capture", () => {
    const boot = generateHydrationScript({ nonce: "n0nce", eventNames: ["click"] });

    expect(boot.startsWith('<script nonce="n0nce">')).toBe(true);
    expect(boot).toContain('["click"]');
    expect(boot).not.toContain('"keydown"');
    expect(generateHydrationScript({ nonce: { script: "s1", style: "s2" } })).toContain(
      'nonce="s1"',
    );
  });
});

describe("an error a server render sends to the browser", () => {
  test("is redacted in production and kept in development, in the markup and the seed", async () => {
    const page = await renderPage(rejecting(new Error(SECRET)));

    if (isDev) {
      expect(page.html).toContain(SECRET);
      expect(page.script).toContain(SECRET);
    } else {
      expect(page.html).not.toContain("db.example.com");
      expect(page.script).not.toContain("db.example.com");
      expect(page.html).toContain(GENERIC);
      expect(page.script).toContain(GENERIC);
    }
  });

  test("is redacted on a stream the same way", async () => {
    let body = "";
    // With no `onError`, the stream logs what failed after the shell: the
    // server's own log is where the unredacted error belongs.
    const printed = await printedBy(async () => {
      body = await collect(renderToStream(rejecting(new Error(SECRET))).readable);
    });
    const logged = printed.map(([first]) => first).filter((first) => first instanceof Error);
    expect(logged.map((error) => error.message)).toEqual([SECRET]);
    expectOnly(
      printed.filter(([first]) => !(first instanceof Error)),
      "SSR_RENDER_ERROR_CONTAINED",
    );

    if (isDev) expect(body).toContain(SECRET);
    else {
      expect(body).not.toContain("db.example.com");
      expect(body).toContain(GENERIC);
    }
  });

  test("passes through in every build when the application marked it safe", async () => {
    const page = await renderPage(
      rejecting(markSafeError(new Error("salama, that account is locked"))),
    );

    expect(page.html).toContain("salama, that account is locked");
    expect(page.script).toContain("salama, that account is locked");
  });
});
