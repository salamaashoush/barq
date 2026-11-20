/**
 * The stylesheet a dev server inlines into one page's head is that page's.
 *
 * A dev server imports the application once and renders every page from one
 * registry, and it used to inline the whole registry: every rule any request
 * had reached so far. `/` rendered after `/create` on `@barqjs/site` carried
 * `/create`'s `#app` rules, and two modules' blocks came out in whichever order
 * the process had first imported them. The head is now scoped to the modules
 * the matched routes reach, so a page's sheet does not depend on which pages
 * the process rendered before it.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";

import { cleanUp, project } from "./project.ts";

afterAll(cleanUp);

const ABOUT = `import { css, globalCss } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";

globalCss\`
  #app {
    display: flex;
  }
\`;

const card = css\`
  color: teal;
\`;

function About() {
  return <p class={card}>about salama</p>;
}

export const Route = createFileRoute("/about")({ component: About });
`;

const INDEX = `import { css } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";

const home = css\`
  color: plum;
\`;

function Home() {
  return <h1 class={home}>barq</h1>;
}

export const Route = createFileRoute("/")({ component: Home });
`;

/** What each path's head inlines, rendered by one dev server in the order given. */
async function render(paths: readonly string[]): Promise<Record<string, string>> {
  const root = project("full-stack", {
    "src/routes/about.tsx": ABOUT,
    "src/routes/index.tsx": INDEX,
  });
  const server = await createServer({
    root,
    configLoader: "runner",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const http = createHttpServer(server.middlewares);
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as { port: number };
  try {
    const out: Record<string, string> = {};
    for (const path of paths) {
      const html = await (
        await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: "text/html" } })
      ).text();
      out[path] = [...html.matchAll(/<style id="barq-css(?:-atoms)?"[^>]*>([\s\S]*?)<\/style>/g)]
        .map((match) => match[1])
        .join("");
    }
    return out;
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await Promise.race([
      server.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
}

describe("a dev page's inlined stylesheet", () => {
  test("is the same for each route whichever the server rendered first", async () => {
    const forward = await render(["/", "/about"]);
    const backward = await render(["/about", "/"]);
    expect(forward["/"]).toBe(backward["/"]);
    expect(forward["/about"]).toBe(backward["/about"]);
    expect(forward["/"]).toContain("color: plum");
    expect(forward["/about"]).toContain("color: teal");
  }, 120_000);

  test("holds no rule of a route the page is not", async () => {
    const pages = await render(["/about", "/"]);
    expect(pages["/about"]).toContain("#app");
    expect(pages["/"]).not.toContain("#app");
    expect(pages["/"]).not.toContain("color: teal");
  }, 120_000);
});
