/**
 * Static HTML, written by the SAME handler that serves a live request.
 *
 * The decision this file rests on, and the field is nearly unanimous on the
 * other side of it: a prerendered page is `createPageHandler` with
 * `stream: false`, NOT a streamed response buffered to a string.
 *
 * SvelteKit and Nitro — and so Solid Start, Nuxt and TanStack Start — prerender
 * by calling the real handler and doing `Buffer.from(await res.arrayBuffer())`
 * with streaming still on. Buffering does not undo streaming: the protocol is
 * emitted at FLUSH time, so by the time you hold the bytes the placeholders and
 * the swap scripts are already in them. A SvelteKit prerendered file, reproduced
 * on 2.70.3, ships `<p>loading...</p>` as its static markup with
 * `<script>…resolve(1, () => ["LATE_STREAMED_VALUE"])</script>` after `</html>`,
 * for data that was fully known at build time.
 *
 * Astro is the exception and its fix is ten lines: a build-time subclass whose
 * `resolveStreaming()` returns undefined. barq gets that for free, because
 * `stream: false` is a different RENDERER — `renderPage` awaits `settle`, walks
 * the seed with `settleNested`, and emits one `__BARQ_DATA__` script with no
 * channel, no swap helper and no `<template>` anywhere.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** What the built server entry has to export for any of this to work. */
export interface ServerEntryModule {
  readonly default?: { readonly fetch?: (request: Request) => Promise<Response> };
  readonly createFetch?: (
    extra: Record<string, unknown>,
  ) => (request: Request) => Promise<Response>;
}

export interface PrerenderRun {
  readonly entry: ServerEntryModule;
  readonly outDir: string;
  readonly routes: readonly string[];
  readonly crawl: boolean;
  readonly concurrency: number;
  readonly subfolderIndex: boolean;
  readonly base: string;
  readonly log?: (message: string) => void;
}

export interface PrerenderResult {
  readonly pages: PrerenderedPage[];
}

export interface PrerenderedPage {
  readonly path: string;
  readonly file: string;
  readonly status: number;
  readonly headers: Record<string, string>;
}

/**
 * A path, as the dedup key sees it.
 *
 * Trailing slashes are normalised and the query is DROPPED, both because of
 * open bugs in the nearest prior art. TanStack's crawler appends a trailing
 * slash without `respectQueryAndFragment`, so `/posts?page=2` becomes
 * `/posts?page=2/`, re-serialises as `page=2%2F`, and every crawl step produces
 * a URL nothing has seen — the crawl never terminates (#7837). And `/x` against
 * `/x/` as two keys is their #6978. A query string has no effect on a statically
 * exported page anyway, which is the note SvelteKit's crawler carries.
 */
function normalize(path: string): string | null {
  if (path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  const [withoutHash = ""] = path.split("#");
  const [clean = ""] = withoutHash.split("?");
  if (clean === "") return null;
  const trimmed = clean.length > 1 ? clean.replace(/\/+$/, "") : clean;
  return trimmed === "" ? "/" : trimmed;
}

/** Same-origin `href`s and `src`s, which is what a crawl follows. */
function linksIn(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*?\shref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (href !== undefined) out.push(href);
  }
  return out;
}

/** `/about` -> `dist/client/about/index.html`, or `about.html`. */
function fileFor(path: string, outDir: string, subfolderIndex: boolean): string {
  const clean = path.replace(/^\/+/, "");
  if (clean === "") return join(outDir, "index.html");
  if (clean.endsWith(".html")) return join(outDir, clean);
  return subfolderIndex ? join(outDir, clean, "index.html") : join(outDir, `${clean}.html`);
}

/**
 * Render every reachable path and write it.
 *
 * Failures are COLLECTED and rethrown after the queue drains, never swallowed.
 * TanStack's equivalent adds to its queue without awaiting and resolves on
 * `onSettled` regardless of outcome, so their `failOnError` cannot fail a build
 * and their `retryCount` is dead code (#8120). A build that emits a broken page
 * and exits 0 is the failure a prerenderer exists to prevent.
 */
export async function prerender(run: PrerenderRun): Promise<PrerenderResult> {
  const build = run.entry.createFetch;
  if (typeof build !== "function") {
    throw new Error(
      "[barq-start] prerendering needs the server entry to export `createFetch(extra)` — " +
        "`stream: false` is a different renderer from a buffered stream, and a handler built " +
        "with streaming on bakes its placeholders and swap scripts into the static file",
    );
  }

  const fetchPage = build({
    stream: false,
    // A prerendered page has no request. Refusing beats SvelteKit's shape, where
    // `cookies.get` and `request.headers` silently answer null and the page is
    // built from a build machine's idea of who is asking.
    refuseRequest:
      "getRequest() is not available while prerendering: this page is built once, for everyone. " +
      "Move what needs a request behind a route that is not prerendered.",
    // A nonce baked into a static file is a constant an attacker reads, which is
    // the opposite of what a nonce is. SvelteKit bans `csp.mode: "nonce"` under
    // prerender outright and React ships the same note on its static entry.
    nonce: undefined,
  });

  const seen = new Set<string>();
  const queue: string[] = [];
  const pages: PrerenderedPage[] = [];
  const failures: string[] = [];

  const enqueue = (path: string): void => {
    const key = normalize(path);
    if (key === null || seen.has(key)) return;
    seen.add(key);
    queue.push(key);
  };

  for (const route of run.routes.length > 0 ? run.routes : ["/"]) enqueue(route);

  const one = async (path: string): Promise<void> => {
    const response = await fetchPage(new Request(`http://prerender.localhost${path}`));
    const html = await response.text();
    if (response.status >= 400) {
      failures.push(`${path} answered ${response.status}`);
      return;
    }
    const file = fileFor(path, run.outDir, run.subfolderIndex);
    await mkdir(dirname(file), { recursive: true });
    // Written as each page finishes rather than accumulated: SvelteKit's #5233
    // is ~300 data-heavy pages held in memory until the end and a 2 GB heap.
    await writeFile(file, html, "utf8");
    pages.push({
      path,
      file,
      status: response.status,
      headers: Object.fromEntries(response.headers),
    });
    run.log?.(`${path} -> ${file}`);
    if (!run.crawl) return;
    for (const href of linksIn(html)) {
      if (!href.startsWith("/")) continue;
      const inside = run.base === "/" || href.startsWith(run.base);
      if (inside) enqueue(run.base === "/" ? href : href.slice(run.base.length - 1));
    }
  };

  while (queue.length > 0) {
    const batch = queue.splice(0, Math.max(1, run.concurrency));
    const settled = await Promise.allSettled(batch.map(one));
    for (const [index, outcome] of settled.entries()) {
      if (outcome.status === "rejected") {
        const reason = outcome.reason as { message?: string };
        failures.push(`${batch[index]}: ${reason?.message ?? String(outcome.reason)}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `[barq-start] ${failures.length} page(s) failed to prerender:\n  ` + failures.join("\n  "),
    );
  }
  return { pages };
}
