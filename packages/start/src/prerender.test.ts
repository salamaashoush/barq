import { afterAll, expect, test } from "bun:test";

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type ServerEntryModule, prerender, prerenderShell } from "./prerender.ts";

const sandbox = mkdtempSync(join(tmpdir(), "barq-prerender-"));
const outDir = join(sandbox, "project", "dist", "client");

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const html = (body: string): Response =>
  new Response(`<!doctype html><body>${body}</body>`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });

/** A site whose home page carries one link an author wrote with dot segments. */
const entry: ServerEntryModule = {
  default: {
    createFetch: () => async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname === "/") return html('<a href="/../../../about">about</a>');
      if (pathname === "/about") return html("<h1>about</h1>");
      return new Response("not found", { status: 404 });
    },
  },
};

test("one page under two spellings is written once, under the name a person reads", async () => {
  const out = join(sandbox, "names", "dist", "client");
  const menu: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/") return html('<a href="/caf%C3%A9">menu</a><a href="/café/">menu</a>');
        if (pathname === "/caf%C3%A9") return html("<h1>menu</h1>");
        return new Response("not found", { status: 404 });
      },
    },
  };

  const { pages } = await prerender({
    entry: menu,
    outDir: out,
    routes: ["/"],
    crawl: true,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  });

  expect(pages.map((page) => page.path)).toEqual(["/", "/café"]);
  expect(existsSync(join(out, "café", "index.html"))).toBe(true);
});

test("a crawled href with dot segments is never written outside the output directory", async () => {
  await prerender({
    entry,
    outDir,
    routes: ["/"],
    crawl: true,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  }).catch(() => undefined);

  expect(existsSync(join(outDir, "index.html"))).toBe(true);
  // `join(outDir, "../../../about", "index.html")`, three levels above
  // `dist/client`: beside the project, not inside it.
  expect(existsSync(join(sandbox, "about", "index.html"))).toBe(false);
});

/** A site of one slow page and several quick ones, reporting how it was asked. */
const paced = (slowMs: number, quickMs: number) => {
  const state = { inFlight: 0, most: 0, startedWhileSlowRan: 0, slowRunning: false };
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        const slow = pathname === "/slow";
        state.inFlight += 1;
        state.most = Math.max(state.most, state.inFlight);
        if (slow) state.slowRunning = true;
        else if (state.slowRunning) state.startedWhileSlowRan += 1;
        await Bun.sleep(slow ? slowMs : quickMs);
        if (slow) state.slowRunning = false;
        state.inFlight -= 1;
        return html(`<h1>${pathname}</h1>`);
      },
    },
  };
  return { site, state };
};

const quick = Array.from({ length: 6 }, (_, index) => `/quick-${index}`);

test("a slow page holds one slot, and the rest of the queue moves through the others", async () => {
  const { site, state } = paced(120, 1);
  await prerender({
    entry: site,
    outDir: join(sandbox, "paced"),
    routes: ["/slow", ...quick],
    crawl: false,
    concurrency: 2,
    subfolderIndex: true,
    base: "/",
  });

  // Every quick page fits inside the slow one's 120 ms when a slot is free for
  // them; taken a batch at a time, only the one that shared its batch does.
  expect(state.startedWhileSlowRan).toBe(quick.length);
  expect(state.most).toBe(2);
});

test("a page that fails does not stop the ones queued behind it, and still fails the build", async () => {
  const written: string[] = [];
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/broken") throw new Error("no such row");
        return html(`<h1>${pathname}</h1>`);
      },
    },
  };
  const outcome = await prerender({
    entry: site,
    outDir: join(sandbox, "failing"),
    routes: ["/broken", ...quick],
    crawl: false,
    concurrency: 2,
    subfolderIndex: true,
    base: "/",
    log: (message) => written.push(message),
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );

  expect(outcome?.message).toContain("1 page(s) failed to prerender");
  expect(outcome?.message).toContain("/broken: no such row");
  expect(written).toHaveLength(quick.length);
});

test("a path the filter refuses is never requested, written, or crawled from", async () => {
  const asked: string[] = [];
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        asked.push(pathname);
        if (pathname === "/") return html('<a href="/docs">docs</a><a href="/admin">admin</a>');
        if (pathname === "/admin") return html('<a href="/admin/users">users</a>');
        return html(`<h1>${pathname}</h1>`);
      },
    },
  };
  const out = join(sandbox, "filtered");
  const { pages } = await prerender({
    entry: site,
    outDir: out,
    routes: ["/"],
    crawl: true,
    concurrency: 2,
    subfolderIndex: true,
    base: "/",
    filter: (path) => !path.startsWith("/admin"),
  });

  expect(asked.toSorted()).toEqual(["/", "/docs"]);
  expect(pages.map((page) => page.path).toSorted()).toEqual(["/", "/docs"]);
  expect(existsSync(join(out, "admin"))).toBe(false);
});

test("a not-found page the build names is written with its status, and a crawled 404 still fails", async () => {
  const out = join(sandbox, "not-found", "dist", "client");
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/") return html("<h1>home</h1>");
        return new Response("<h1>nothing here</h1>", {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  const { pages } = await prerender({
    entry: site,
    outDir: out,
    routes: ["/", "/404"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  });
  expect(pages.map((page) => [page.path, page.status])).toEqual([
    ["/", 200],
    ["/404", 404],
  ]);
  expect(existsSync(join(out, "404", "index.html"))).toBe(true);

  const linked: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        if (pathname === "/") return html('<a href="/gone">gone</a>');
        return new Response("<h1>nothing here</h1>", {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  };
  const outcome = await prerender({
    entry: linked,
    outDir: join(sandbox, "not-found-linked"),
    routes: ["/"],
    crawl: true,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );
  expect(outcome?.message).toContain("/gone answered 404");
});

/** A site whose pages fail the first `failing` times they are asked for. */
const flaky = (failing: number, events: string[] = []) => {
  const asked = new Map<string, number>();
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        const count = (asked.get(pathname) ?? 0) + 1;
        asked.set(pathname, count);
        events.push(`ask ${pathname}`);
        if (count > failing) return html(`<h1>${pathname}</h1>`);
        if (pathname === "/throws") throw new Error("no such row");
        return new Response("upstream is down", { status: 503 });
      },
    },
  };
  return { site, asked };
};

test("a page that throws or answers 5xx is asked again, and written when it then succeeds", async () => {
  // The retry delay is a timer, so the proof it was honoured is the timer
  // firing between the two asks, not a clock reading across them.
  const events: string[] = [];
  const { site, asked } = flaky(1, events);
  const real = globalThis.setTimeout;
  const recording = (handler: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) =>
    real(
      (...passed: unknown[]) => {
        if (ms === 40) events.push("waited 40");
        handler(...passed);
      },
      ms,
      ...args,
    );
  globalThis.setTimeout = recording as unknown as typeof setTimeout;
  const { pages } = await prerender({
    entry: site,
    outDir: join(sandbox, "retried"),
    routes: ["/throws", "/down"],
    crawl: false,
    concurrency: 2,
    subfolderIndex: true,
    base: "/",
    retryCount: 1,
    retryDelay: 40,
  }).finally(() => {
    globalThis.setTimeout = real;
  });

  expect(
    pages
      .map((page) => [page.path, page.status] as const)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ).toEqual([
    ["/down", 200],
    ["/throws", 200],
  ]);
  expect(Object.fromEntries(asked)).toEqual({ "/throws": 2, "/down": 2 });
  for (const path of ["/throws", "/down"]) {
    const first = events.indexOf(`ask ${path}`);
    const again = events.lastIndexOf(`ask ${path}`);
    expect(events.slice(first, again), `${path} waited before its retry`).toContain("waited 40");
  }
});

test("a page that is still failing after its retries fails the build, once", async () => {
  const { site, asked } = flaky(Number.POSITIVE_INFINITY);
  const outcome = await prerender({
    entry: site,
    outDir: join(sandbox, "exhausted"),
    routes: ["/throws", "/down"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
    retryCount: 2,
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );

  expect(Object.fromEntries(asked)).toEqual({ "/throws": 3, "/down": 3 });
  expect(outcome?.message.split("\n")).toEqual([
    "[barq-start] 2 page(s) failed to prerender, so the build stopped before shipping a broken page:",
    "  /throws: no such row",
    "  /down answered 503",
  ]);
});

test("without a retry count a failing page is asked for once", async () => {
  const { site, asked } = flaky(1);
  const outcome = await prerender({
    entry: site,
    outDir: join(sandbox, "unretried"),
    routes: ["/down"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );

  expect(asked.get("/down")).toBe(1);
  expect(outcome?.message.split("\n")).toEqual([
    "[barq-start] 1 page(s) failed to prerender, so the build stopped before shipping a broken page:",
    "  /down answered 503",
  ]);
});

test("a crawled link answering 404 is not retried", async () => {
  const asked: string[] = [];
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        const { pathname } = new URL(request.url);
        asked.push(pathname);
        if (pathname === "/") return html('<a href="/gone">gone</a>');
        return new Response("<h1>nothing here</h1>", {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  };
  const outcome = await prerender({
    entry: site,
    outDir: join(sandbox, "gone"),
    routes: ["/"],
    crawl: true,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
    retryCount: 3,
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );

  expect(asked).toEqual(["/", "/gone"]);
  expect(outcome?.message).toContain("/gone answered 404");
});

/** A site with a not-found page at `/404` and an ordinary page everywhere else. */
const withNotFound = (status: number): ServerEntryModule => ({
  default: {
    createFetch: () => async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname !== "/404") return html(`<h1>${pathname}</h1>`);
      return new Response("<!doctype html><body><h1>nothing here</h1></body>", {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  },
});

test("the sitemap lists every page written with a 2xx, sorted, and not the not-found page", async () => {
  const out = join(sandbox, "sitemap", "dist", "client");
  const { pages, sitemap } = await prerender({
    entry: withNotFound(404),
    outDir: out,
    routes: ["/zebra", "/404", "/café", "/about", "/", "/a&b"],
    crawl: false,
    concurrency: 3,
    subfolderIndex: true,
    base: "/",
    sitemap: { host: "https://example.com/" },
  });

  expect(pages).toHaveLength(6);
  expect(sitemap).toBe(join(out, "sitemap.xml"));
  expect(readFileSync(join(out, "sitemap.xml"), "utf8")).toBe(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      "  <url>",
      "    <loc>https://example.com/</loc>",
      "  </url>",
      "  <url>",
      "    <loc>https://example.com/a&amp;b</loc>",
      "  </url>",
      "  <url>",
      "    <loc>https://example.com/about</loc>",
      "  </url>",
      "  <url>",
      "    <loc>https://example.com/caf%C3%A9</loc>",
      "  </url>",
      "  <url>",
      "    <loc>https://example.com/zebra</loc>",
      "  </url>",
      "</urlset>",
      "",
    ].join("\n"),
  );
});

test("a sitemap entry carries the base, and a not-found page answering 200 stays out", async () => {
  const out = join(sandbox, "sitemap-base", "dist", "client");
  const { sitemap } = await prerender({
    entry: withNotFound(200),
    outDir: out,
    routes: ["/", "/404", "/about"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/docs/",
    sitemap: { host: "https://example.com", outputPath: "maps/pages.xml" },
  });

  expect(sitemap).toBe(join(out, "maps", "pages.xml"));
  const locations = [
    ...readFileSync(join(out, "maps", "pages.xml"), "utf8").matchAll(/<loc>([^<]*)<\/loc>/g),
  ].map((match) => match[1]);
  expect(locations).toEqual(["https://example.com/docs/", "https://example.com/docs/about"]);
});

test("without the option no sitemap is written", async () => {
  const out = join(sandbox, "no-sitemap");
  const result = await prerender({
    entry: withNotFound(404),
    outDir: out,
    routes: ["/"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  });

  expect(result.sitemap).toBeUndefined();
  expect(existsSync(join(out, "sitemap.xml"))).toBe(false);
});

test("a sitemap path that leaves the output directory is refused before a page is asked for", async () => {
  const asked: string[] = [];
  const site: ServerEntryModule = {
    default: {
      createFetch: () => async (request) => {
        asked.push(new URL(request.url).pathname);
        return html("<h1>home</h1>");
      },
    },
  };
  const out = join(sandbox, "sitemap-escape", "dist", "client");
  const outcome = await prerender({
    entry: site,
    outDir: out,
    routes: ["/"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
    sitemap: { host: "https://example.com", outputPath: "../sitemap.xml" },
  }).then(
    () => null,
    (error: unknown) => error as Error,
  );

  expect(outcome?.message).toContain("would be written outside the output directory");
  expect(asked).toEqual([]);
  expect(existsSync(join(sandbox, "sitemap-escape", "dist", "sitemap.xml"))).toBe(false);
});

test("the not-found page is also written as 404.html at the root, byte for byte", async () => {
  for (const status of [404, 200]) {
    const out = join(sandbox, `not-found-root-${status}`, "dist", "client");
    const { pages, notFoundFile } = await prerender({
      entry: withNotFound(status),
      outDir: out,
      routes: ["/", "/404"],
      crawl: false,
      concurrency: 1,
      subfolderIndex: true,
      base: "/",
    });

    expect(notFoundFile).toBe(join(out, "404.html"));
    expect(pages.map((page) => [page.path, page.file, page.status])).toEqual([
      ["/", join(out, "index.html"), 200],
      ["/404", join(out, "404", "index.html"), status],
    ]);
    const page = readFileSync(join(out, "404", "index.html"));
    expect(page.length).toBeGreaterThan(0);
    expect(readFileSync(join(out, "404.html")).equals(page)).toBe(true);
  }
});

test("with flat files the not-found page is 404.html already, and nothing is written twice", async () => {
  const out = join(sandbox, "not-found-flat", "dist", "client");
  const { pages, notFoundFile } = await prerender({
    entry: withNotFound(404),
    outDir: out,
    routes: ["/", "/404"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: false,
    base: "/",
  });

  expect(pages.map((page) => page.file)).toEqual([join(out, "index.html"), join(out, "404.html")]);
  expect(notFoundFile).toBeUndefined();
  expect(existsSync(join(out, "404"))).toBe(false);
});

test("a site with no /404 page gets no 404.html", async () => {
  const out = join(sandbox, "no-not-found");
  const { notFoundFile } = await prerender({
    entry: withNotFound(404),
    outDir: out,
    routes: ["/"],
    crawl: false,
    concurrency: 1,
    subfolderIndex: true,
    base: "/",
  });

  expect(notFoundFile).toBeUndefined();
  expect(existsSync(join(out, "404.html"))).toBe(false);
});

test("the SPA shell is one request for the root, written where it was asked to be", async () => {
  const shellOut = join(sandbox, "shell", "client");
  const asked: { path: string; extra: Record<string, unknown> }[] = [];
  const shellEntry: ServerEntryModule = {
    default: {
      createFetch: (extra) => async (request) => {
        asked.push({ path: new URL(request.url).pathname, extra });
        return html("shell");
      },
    },
  };

  const file = await prerenderShell({
    entry: shellEntry,
    outDir: shellOut,
    maskPath: "/app",
    outputPath: "/_shell.html",
  });
  expect(file).toBe(join(shellOut, "_shell.html"));
  expect(readFileSync(file, "utf8")).toBe("<!doctype html><body>shell</body>");
  expect(asked).toHaveLength(1);
  expect(asked[0]?.path).toBe("/app");
  // Not a stream, pages on whatever the deployed handler renders, and the
  // shell asked for by name.
  expect(asked[0]?.extra).toMatchObject({ stream: false, pages: true, shell: true });

  expect(
    prerenderShell({ entry: shellEntry, outDir: shellOut, outputPath: "../outside.html" }),
  ).rejects.toThrow("outside the output directory");
});

test("a shell that does not render fails the build", async () => {
  const failing: ServerEntryModule = {
    default: { createFetch: () => async () => new Response("no", { status: 500 }) },
  };
  expect(
    prerenderShell({ entry: failing, outDir: join(sandbox, "failing", "client") }),
  ).rejects.toThrow("answered 500");
});
