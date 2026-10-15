// oxlint-disable no-eval -- the seed payload IS a program, and running it is how
// a browser consumes it.

/**
 * An error boundary whose loading boundary fails AFTER the shell.
 *
 * The error boundary wrote its markup when the shell was built, around the
 * loading boundary's fallback, so by the time the resume fails there is no
 * frame left for it to catch in. A buffered page is still being assembled at
 * that point, and the error boundary's fallback is what it owes; a stream has
 * already sent those bytes, and the client rebuilds the failed boundary.
 */

import { type Cell, HYDRATE, createMemo } from "@barqjs/core";
import { afterEach, describe, expect, test } from "bun:test";

import { clearRenderData, renderPage, renderToStream } from "./server.ts";
import { type SsrHtml, boundary, esc, html } from "./ssr.ts";

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  clearRenderData();
  (globalThis as { __BARQ_DATA__?: unknown }).__BARQ_DATA__ = undefined;
});

const failed = (error: Cell<unknown>): SsrHtml =>
  html(`<em>failed: ${esc((error() as Error).message)}</em>`);

function errored(body: () => SsrHtml, flags = HYDRATE): string {
  return esc(boundary(null, null, "error", failed, body, flags));
}

function loading(body: () => SsrHtml, flags = HYDRATE): string {
  return esc(boundary(null, null, "loading", () => html("<i>skel</i>"), body, flags));
}

const rejectsLate = (key: string) =>
  createMemo(
    async (): Promise<string> => {
      await tick();
      throw new Error("late boom");
    },
    { key },
  );

describe("a buffered page", () => {
  test("shows the error boundary's fallback for a read that fails after the shell", async () => {
    const page = await renderPage(() => {
      const bad = rejectsLate("bad");
      return html(
        `<main>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`))))}</main>`,
      );
    });

    expect(page.html).toBe("<main><!--[f:--><em>failed: late boom</em><!--]--></main>");
  });

  test("shows it for a throw that only happens once the value has arrived", async () => {
    const page = await renderPage(() => {
      const late = createMemo(async () => {
        await tick();
        return "LATE";
      });
      const boom = (): string => {
        if (late() === "LATE") throw new Error("late boom");
        return "never";
      };
      return html(
        `<main>${errored(() => html(loading(() => html(`<b>${esc(boom())}</b>`))))}</main>`,
      );
    });

    expect(page.html).toBe("<main><!--[f:--><em>failed: late boom</em><!--]--></main>");
  });

  test("writes the fallback bare when the page does not hydrate", async () => {
    const page = await renderPage(() => {
      const bad = rejectsLate("bad");
      return html(
        `<main>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`), 0)), 0)}</main>`,
      );
    });

    expect(page.html).toBe("<main><em>failed: late boom</em></main>");
  });

  test("an error boundary with nothing failing below it leaves no marker behind", async () => {
    const page = await renderPage(() => {
      const late = createMemo(async () => {
        await tick();
        return "LATE";
      });
      return html(
        `<main>${errored(() => html(loading(() => html(`<b>${esc(late())}</b>`))))}</main>`,
      );
    });

    expect(page.html).toBe("<main><!--[--><!--[--><b>LATE</b><!--]--><!--]--></main>");
  });

  test("does not resume a boundary the failure took off the page", async () => {
    let builds = 0;
    const page = await renderPage(() => {
      const bad = rejectsLate("bad");
      const sibling = createMemo(async () => {
        await tick();
        return "SIBLING";
      });
      return html(
        `<main>${errored(() =>
          html(
            loading(() => html(`<b>${esc(bad())}</b>`)) +
              loading(() => {
                builds++;
                return html(`<u>${esc(sibling())}</u>`);
              }),
          ),
        )}</main>`,
      );
    });

    expect(page.html).toBe("<main><!--[f:--><em>failed: late boom</em><!--]--></main>");
    // The shell's build only. A resume after the failure would build content
    // for markup that is no longer on the page.
    expect(builds).toBe(1);
  });

  test("finishes at the boundary deadline when a read never answers", async () => {
    const started = Date.now();
    const page = await renderPage(() => {
      const never = createMemo(() => new Promise<string>(() => {}), { key: "never" });
      return html(`<main>${loading(() => html(`<u>${esc(never())}</u>`))}</main>`);
    });

    expect(page.html).toBe("<main><!--[b:0--><i>skel</i><!--]--></main>");
    expect(Date.now() - started).toBeLessThan(7_000);
  }, 10_000);

  test("still fails when no error boundary stands around the boundary", async () => {
    const render = renderPage(() => {
      const bad = rejectsLate("bad");
      return html(`<main>${loading(() => html(`<b>${esc(bad())}</b>`))}</main>`);
    });

    await expect(render).rejects.toThrow("late boom");
  });

  test("seeds the failed read as a settled rejection, so the client can claim the fallback", async () => {
    const page = await renderPage(() => {
      const bad = rejectsLate("bad");
      return html(
        `<main>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`))))}</main>`,
      );
    });

    expect(Object.keys(page.data)).toEqual(["bad"]);
    const source = /<script[^>]*>([\s\S]*?)<\/script>/.exec(page.script)?.[1] ?? "";
    (0, eval)(source);
    const seeded = (globalThis as { __BARQ_DATA__?: Record<string, unknown> }).__BARQ_DATA__
      ?.bad as {
      s?: number;
      v?: unknown;
    };
    expect(seeded.s).toBe(2);
    expect(String(seeded.v)).toBe("Error: late boom");
  });
});

async function chunksOf(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks;
}

/** A browser's reading of a stream: each chunk lands, then its scripts run. */
function assemble(chunks: readonly string[]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const script = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  for (const chunk of chunks) {
    host.insertAdjacentHTML("beforeend", chunk.replace(script, ""));
    for (const [, source] of chunk.matchAll(script)) (0, eval)(source ?? "");
  }
  for (const node of host.querySelectorAll("script")) node.remove();
  return host;
}

describe("a stream", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const lateFailure = (): SsrHtml => {
    const bad = rejectsLate("bad");
    return html(`<main>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`))))}</main>`);
  };

  test("places the error boundary's fallback over everything it held, and reports the failure", async () => {
    const seen: unknown[] = [];
    const chunks = await chunksOf(
      renderToStream(lateFailure, { onError: (error) => seen.push(error) }),
    );
    const out = chunks.join("");

    expect(out).toStartWith("<main><!--[e:1--><!--[b:0--><i>skel</i><!--]--><!--]--></main>");
    expect(out).toContain(
      '<template data-barq="1"><!--[f:--><em>failed: late boom</em><!--]--></template>' +
        "<script>window.__BARQ_SWAP__(1,false,true)</script>",
    );
    expect(seen.map(String)).toEqual(["Error: late boom"]);
  });

  test("assembles to the page a buffered render writes", async () => {
    const buffered = await renderPage(lateFailure);
    clearRenderData();
    const host = assemble(await chunksOf(renderToStream(lateFailure, { onError: () => {} })));

    expect(host.innerHTML).toBe(buffered.html);
  });

  test("writes the fallback bare when the page does not hydrate", async () => {
    const host = assemble(
      await chunksOf(
        renderToStream(
          () => {
            const bad = rejectsLate("bad");
            return html(
              `<main>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`), 0)), 0)}</main>`,
            );
          },
          { onError: () => {} },
        ),
      ),
    );

    expect(host.innerHTML).toBe("<main><em>failed: late boom</em></main>");
  });

  test("hands the fallback the error the read failed with, and a reset", async () => {
    const given: unknown[] = [];
    const chunks = await chunksOf(
      renderToStream(
        () => {
          const bad = rejectsLate("bad");
          return html(
            `<main>${esc(
              boundary(
                null,
                null,
                "error",
                (error: Cell<unknown>, reset: unknown) => {
                  given.push(error(), typeof reset);
                  return html(`<em>${esc((error() as Error).message)}</em>`);
                },
                () => html(loading(() => html(`<b>${esc(bad())}</b>`))),
                HYDRATE,
              ),
            )}</main>`,
          );
        },
        { onError: () => {} },
      ),
    );

    expect(given).toHaveLength(2);
    expect(given[0]).toBeInstanceOf(Error);
    expect((given[0] as Error).message).toBe("late boom");
    expect(given[1]).toBe("function");
    expect(chunks.join("")).toContain("<em>late boom</em>");
  });

  test("the nearest error boundary catches, and the one around it keeps its content", async () => {
    const host = assemble(
      await chunksOf(
        renderToStream(
          () => {
            const bad = rejectsLate("bad");
            const outer = (body: () => SsrHtml): string =>
              esc(boundary(null, null, "error", () => html("<em>outer</em>"), body, HYDRATE));
            return html(
              `<main>${outer(() =>
                html(
                  `<p>kept</p>${errored(() => html(loading(() => html(`<b>${esc(bad())}</b>`))))}`,
                ),
              )}</main>`,
            );
          },
          { onError: () => {} },
        ),
      ),
    );

    expect(host.innerHTML).toBe(
      "<main><!--[--><p>kept</p><!--[f:--><em>failed: late boom</em><!--]--><!--]--></main>",
    );
  });

  test("does not swap in a boundary the failure took off the page", async () => {
    const built: string[] = [];
    const chunks = await chunksOf(
      renderToStream(
        () => {
          const bad = rejectsLate("bad");
          const sibling = createMemo(async () => {
            await tick();
            await tick();
            return "SIBLING";
          });
          return html(
            `<main>${errored(() =>
              html(
                loading(() => html(`<b>${esc(bad())}</b>`)) +
                  loading(() => {
                    const value = sibling();
                    built.push(value);
                    return html(`<u>${esc(value)}</u>`);
                  }),
              ),
            )}</main>`,
          );
        },
        { onError: () => {} },
      ),
    );
    const host = assemble(chunks);

    expect(host.innerHTML).toBe("<main><!--[f:--><em>failed: late boom</em><!--]--></main>");
    expect(chunks.join("").match(/<template/g)).toHaveLength(1);
    expect(built).toEqual([]);
  });

  test("keeps the loading fallback when no error boundary stands around it", async () => {
    const seen: unknown[] = [];
    const out = (
      await chunksOf(
        renderToStream(
          () => {
            const bad = rejectsLate("bad");
            return html(`<main>${loading(() => html(`<b>${esc(bad())}</b>`))}</main>`);
          },
          { onError: (error) => seen.push(error) },
        ),
      )
    ).join("");

    expect(out).toStartWith("<main><!--[b:0--><i>skel</i><!--]--></main>");
    expect(out).not.toContain("<template");
    expect(seen.map(String)).toEqual(["Error: late boom"]);
  });
});

describe("an error boundary that catches while it builds", () => {
  test("marks its fallback so the client does not claim it as the content", async () => {
    const page = await renderPage(() =>
      html(
        `<main>${errored(() => {
          throw new Error("now");
        })}</main>`,
      ),
    );

    expect(page.html).toBe("<main><!--[f:--><em>failed: now</em><!--]--></main>");
  });
});
