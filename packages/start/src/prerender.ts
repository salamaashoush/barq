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
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import { PRERENDER_HEADER, type ServerEntryModule } from "./protocol.ts";
import { STATIC_PREFIX, installStaticWriter } from "./static-fn.ts";

export type { ServerEntryModule };

export interface PrerenderRun {
  readonly entry: ServerEntryModule;
  readonly outDir: string;
  readonly routes: readonly string[];
  readonly crawl: boolean;
  readonly concurrency: number;
  readonly subfolderIndex: boolean;
  readonly base: string;
  /** Whether a path is prerendered at all. Asked with the normalised path. */
  readonly filter?: (path: string) => boolean;
  /**
   * How many more times a page is asked for after its request throws or answers
   * 5xx. Default 0.
   *
   * A 4xx is an answer, not a failure to answer: asking again gets it again.
   */
  readonly retryCount?: number;
  /** Milliseconds to wait before each retry. Default 0. */
  readonly retryDelay?: number;
  /**
   * Write a sitemap of what was prerendered.
   *
   * `host` is the origin the site is deployed at, which the build cannot know.
   * `outputPath` is relative to `outDir` and defaults to `sitemap.xml`.
   */
  readonly sitemap?: PrerenderSitemap;
  readonly log?: (message: string) => void;
}

export interface PrerenderSitemap {
  readonly host: string;
  readonly outputPath?: string;
}

export interface PrerenderResult {
  readonly pages: PrerenderedPage[];
  /** The sitemap's file, when one was asked for and a page belongs in it. */
  readonly sitemap?: string;
  /**
   * The copy of the `/404` page at `<outDir>/404.html`, the name a static host
   * serves for a path it has no file for.
   *
   * Absent when the page's own file is that one already. It has no entry in
   * `pages`: it is a second name for a page that is listed there.
   */
  readonly notFoundFile?: string;
  /** The files `staticFunctionMiddleware` answers were written to. */
  readonly staticAnswers: readonly string[];
}

/** One prerendered page, as the build records it. */
export interface PrerenderedPage {
  readonly path: string;
  readonly file: string;
  readonly status: number;
  /**
   * The response's own headers.
   *
   * Kept because a static host cannot recover them from a file, and every
   * framework that drops them has an open issue about it — SvelteKit rescues
   * `cache-control` alone into a `<meta http-equiv>` and leaves the rest
   * unhandled, Nitro loses `content-type` on a generated feed.
   *
   * `writeAssetManifest` in `vite.ts` is what finally persists them, and
   * `static.ts` is what serves a page with the status it was rendered as.
   */
  readonly headers: Record<string, string>;
}

function isHtml(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("text/html");
}

/** The origin every prerender request is made against. It never leaves the build. */
const ORIGIN = "http://prerender.localhost";

/**
 * A path, as the dedup key sees it.
 *
 * Trailing slashes are normalised and the query is DROPPED, both because of
 * open bugs in the nearest prior art. TanStack's crawler appends a trailing
 * slash without `respectQueryAndFragment`, so `/posts?page=2` becomes
 * `/posts?page=2/`, re-serialises as `page=2%2F`, and every crawl step produces
 * a URL nothing has seen, and the crawl never terminates. `/x` against `/x/` as
 * two keys is a second open bug there. A query string has no effect on a statically
 * exported page anyway, which is the note SvelteKit's crawler carries.
 *
 * THROUGH `new URL`, because the key is also what gets requested and what names
 * the file. An `href` is whatever an author typed, and `/../../about` typed into
 * a page is `/about` to every browser that follows it: resolved here, it is one
 * key and one file, where the raw text is a second key and a path that climbs
 * out of the output directory.
 */
function normalize(path: string): string | null {
  if (path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  const [withoutHash = ""] = path.split("#");
  const [clean = ""] = withoutHash.split("?");
  if (clean === "") return null;
  let resolved: string;
  try {
    const url = new URL(clean, ORIGIN);
    if (url.origin !== ORIGIN) return null;
    resolved = url.pathname;
    // Asked now so that a path which names no file is never queued.
    decodeURI(resolved);
  } catch {
    return null;
  }
  const trimmed = resolved.length > 1 ? resolved.replace(/\/+$/, "") : resolved;
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

/**
 * `/about` -> `dist/client/about/index.html`, or `about.html`.
 *
 * CONTAINMENT IS ASSERTED rather than assumed. {@link normalize} resolves dot
 * segments, but the name on disk is the DECODED path, and decoding can produce
 * a separator the URL never had: `..%5C` is one ordinary segment to a URL and a
 * step upward to a Windows path.
 */
function fileFor(path: string, outDir: string, subfolderIndex: boolean): string {
  const clean = path.replace(/^\/+/, "");
  let file: string;
  if (clean === "") file = join(outDir, "index.html");
  else if (clean.endsWith(".html")) file = join(outDir, clean);
  else file = subfolderIndex ? join(outDir, clean, "index.html") : join(outDir, `${clean}.html`);
  return contained(path, file, outDir);
}

function contained(what: string, file: string, outDir: string): string {
  const inside = relative(outDir, file);
  if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(
      `The file for ${what} would be written outside the output directory, to \`${file}\`, so it was refused. ` +
        "Use a path or an `outputPath` that stays inside the output directory, without `..` segments.",
    );
  }
  return file;
}

/** The path every static host looks a missing page up under. */
const NOT_FOUND_PATH = "/404";

/** A count or a delay as given, or 0 for anything that is not a positive number. */
function whole(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * `<loc>` alone. A `<lastmod>` stamped with the build date, which is what the
 * nearest prior art writes, tells a crawler every page changed on every deploy.
 */
function sitemapXml(locations: readonly string[]): string {
  const urls = locations.map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n  </url>\n`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("") +
    "</urlset>\n"
  );
}

/**
 * Render every reachable path and write it.
 *
 * Failures are COLLECTED and rethrown after the queue drains, never swallowed.
 * TanStack's equivalent adds to its queue without awaiting and resolves on
 * `onSettled` regardless of outcome, so their `failOnError` cannot fail a build
 * and their `retryCount` is dead code. A build that emits a broken page
 * and exits 0 is the failure a prerenderer exists to prevent.
 */
export async function prerender(run: PrerenderRun): Promise<PrerenderResult> {
  const build = run.entry.default?.createFetch;
  if (typeof build !== "function") {
    throw new Error(
      "[barq-start] The `prerender` option is set, but the server entry's default export has no `createFetch`, so no page can be rendered to a static file. " +
        "Use `export default createStartHandler()` from `@barqjs/router/server` in the server entry.",
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

  // Asked before anything is rendered: a path that cannot be written is known
  // from the configuration alone, and the whole site is a long wait to find out.
  const sitemap =
    run.sitemap === undefined
      ? undefined
      : {
          host: run.sitemap.host.replace(/\/+$/, ""),
          file: contained(
            "the sitemap",
            join(run.outDir, run.sitemap.outputPath ?? "sitemap.xml"),
            run.outDir,
          ),
        };
  const retries = whole(run.retryCount);
  const retryDelay = whole(run.retryDelay);

  const seen = new Set<string>();
  const queue: string[] = [];
  const pages: PrerenderedPage[] = [];
  const failures: string[] = [];
  // The URL paths, where `pages` holds the decoded names: a `<loc>` is a URL.
  const listed: string[] = [];
  let notFoundFile: string | undefined;

  const enqueue = (path: string): void => {
    const key = normalize(path);
    if (key === null || seen.has(key)) return;
    seen.add(key);
    // After `seen`, so a path linked from every page is asked about once.
    if (run.filter?.(key) === false) return;
    queue.push(key);
  };

  const named = new Set<string>();
  for (const route of run.routes.length > 0 ? run.routes : ["/"]) {
    const key = normalize(route);
    if (key !== null) named.add(key);
    enqueue(route);
  }

  const ask = async (path: string): Promise<{ response: Response; html: string }> => {
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= retries;
      try {
        const response = await fetchPage(new Request(`${ORIGIN}${path}`));
        const html = await response.text();
        if (response.status < 500 || last) return { response, html };
        run.log?.(`${path} answered ${response.status}, asking again`);
      } catch (reason) {
        if (last) throw reason;
        run.log?.(`${path} threw, asking again`);
      }
      if (retryDelay > 0) await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  };

  const one = async (path: string): Promise<void> => {
    const { response, html } = await ask(path);
    const crawledOnly = !named.has(path);
    // A page the build NAMED and the application answers 404 for is the
    // application's not-found page, asked for on purpose: it is written, with
    // the status it was rendered as, for `static.ts` to serve. Anything else at
    // 400 or above is a link to nowhere or a server that failed.
    const notFoundPage = response.status === 404 && !crawledOnly && isHtml(response);
    if (response.status >= 400 && !notFoundPage) {
      failures.push(`${path} answered ${response.status}`);
      return;
    }
    const declined = response.headers.get(PRERENDER_HEADER) === "0";
    if (crawledOnly && declined) {
      // Rendered to find its links, not to be written. A route that has not said
      // `prerender` is a route the build has no business freezing.
      if (run.crawl) followLinks(html);
      return;
    }
    // The NAME, where `path` is the URL: `/caf%C3%A9` is `café/index.html` on
    // disk and `/café` in the manifest, which is how `static.ts` looks it up.
    const name = decodeURI(path);
    const file = fileFor(name, run.outDir, run.subfolderIndex);
    await mkdir(dirname(file), { recursive: true });
    // Written as each page finishes rather than accumulated: holding ~300
    // data-heavy pages to the end is a 2 GB heap, which SvelteKit shipped.
    await writeFile(file, html, "utf8");
    pages.push({
      path: name,
      file,
      status: response.status,
      headers: Object.fromEntries(response.headers),
    });
    run.log?.(`${path} -> ${file}`);
    if (path === NOT_FOUND_PATH) {
      const root = join(run.outDir, "404.html");
      if (root !== file) {
        await writeFile(root, html, "utf8");
        notFoundFile = root;
      }
    } else if (response.ok) {
      listed.push(path);
    }
    if (run.crawl && !notFoundPage) followLinks(html);
  };

  const followLinks = (html: string): void => {
    for (const href of linksIn(html)) {
      if (!href.startsWith("/")) continue;
      const inside = run.base === "/" || href.startsWith(run.base);
      if (inside) enqueue(run.base === "/" ? href : href.slice(run.base.length - 1));
    }
  };

  // A POOL, not batches: a slot is refilled the moment its page finishes, so
  // one slow page costs its own time rather than its whole batch's. The queue
  // grows while it drains, since a crawled page adds what it links to.
  const slots = Math.max(1, run.concurrency);
  let next = 0;
  let active = 0;
  // A static server function's answer is written beside the pages that asked
  // for it, under the name its client half will look for. One name holding two
  // different calls would hand the second caller the first one's answer, so
  // that stops the build rather than being written.
  const answered = new Map<string, string>();
  const staticAnswers: string[] = [];
  installStaticWriter(async (key, identity, answer) => {
    const before = answered.get(key);
    if (before !== undefined && before !== identity) {
      throw new Error(
        `[barq-start] Two static server function calls share the cache name ${key}, so one would be answered with the other's result. ` +
          "Pass a different input to one of them, or drop `staticFunctionMiddleware` from it.",
      );
    }
    const file = contained(
      "a static server function's answer",
      join(run.outDir, STATIC_PREFIX.slice(1), `${key}.json`),
      run.outDir,
    );
    if (before === undefined) {
      answered.set(key, identity);
      staticAnswers.push(file);
    }
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, answer, "utf8");
  });
  await new Promise<void>((drained) => {
    const fill = (): void => {
      while (active < slots) {
        const path = queue[next];
        if (path === undefined) break;
        next += 1;
        active += 1;
        one(path)
          .catch((reason: unknown) => {
            const message = (reason as { message?: string } | null)?.message ?? String(reason);
            failures.push(`${path}: ${message}`);
          })
          .finally(() => {
            active -= 1;
            fill();
          });
      }
      if (active === 0) drained();
    };
    fill();
  }).finally(() => installStaticWriter(null));

  if (failures.length > 0) {
    throw new Error(
      `[barq-start] ${failures.length} page(s) failed to prerender, so the build stopped before shipping a broken page:\n  ` +
        failures.join("\n  "),
    );
  }

  if (sitemap === undefined || listed.length === 0) return { pages, notFoundFile, staticAnswers };
  const base = run.base.replace(/\/+$/, "");
  await mkdir(dirname(sitemap.file), { recursive: true });
  await writeFile(
    sitemap.file,
    sitemapXml(listed.toSorted().map((path) => `${sitemap.host}${base}${path}`)),
    "utf8",
  );
  return { pages, sitemap: sitemap.file, notFoundFile, staticAnswers };
}

/** What {@link prerenderShell} is asked for. */
export interface ShellRun {
  readonly entry: ServerEntryModule;
  readonly outDir: string;
  /** The path the shell is rendered at. `/` when omitted. */
  readonly maskPath?: string;
  /** Where it is written, relative to `outDir`. `_shell.html` when omitted. */
  readonly outputPath?: string;
}

/**
 * Write the SPA shell: the root route's document, with nothing under it
 * rendered, for a server or a static host to answer every page path with.
 *
 * TanStack's SPA mode. The file is one request to the same handler, built with
 * `shell: true`, so the shell is the application's own root route rather than a
 * second document to keep in step with it.
 */
export async function prerenderShell(run: ShellRun): Promise<string> {
  const build = run.entry.default?.createFetch;
  if (typeof build !== "function") {
    throw new Error(
      "[barq-start] SPA mode is on, but the server entry's default export has no `createFetch`, so the shell document cannot be rendered. " +
        "Use `export default createStartHandler()` from `@barqjs/router/server` in the server entry.",
    );
  }
  const file = contained(
    "the SPA shell",
    join(run.outDir, (run.outputPath ?? "_shell.html").replace(/^\/+/, "")),
    run.outDir,
  );
  const fetchShell = build({
    stream: false,
    pages: true,
    shell: true,
    refuseRequest:
      "[barq] `getRequest()` and the other request helpers are not available while the SPA shell is rendered: the shell is built once and served for every path, so there is no request to read. " +
      "Read the request in a loader or a server function instead.",
    nonce: undefined,
  });
  const response = await fetchShell(new Request(`${ORIGIN}${run.maskPath ?? "/"}`));
  if (response.status >= 400 || !isHtml(response)) {
    throw new Error(
      `[barq-start] Rendering the SPA shell at \`${run.maskPath ?? "/"}\` answered ${response.status}${isHtml(response) ? "" : " without an HTML body"}, so no shell was written. ` +
        "The root route's `shellComponent` has to render for that path: check the server output above for the error it threw.",
    );
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await response.text(), "utf8");
  return file;
}
