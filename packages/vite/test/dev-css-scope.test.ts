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

const THEMED = `import { registerCss } from "@barqjs/css";
import { createFileRoute } from "@barqjs/router";

function Themed() {
  // What a theme a page installs as it renders does.
  registerCss("acme:theme", ":root{--acme-theme:1}");
  return <p>themed</p>;
}

export const Route = createFileRoute("/themed")({ component: Themed });
`;

const HEAVY = `import { lazy } from "@barqjs/core";
import { createFileRoute } from "@barqjs/router";

const Chart = lazy(() => import("../heavy-chart.tsx"));

function Heavy() {
  return <Chart />;
}

export const Route = createFileRoute("/heavy")({ component: Heavy });
`;

const CHART = `import { css } from "@barqjs/css";

const chart = css\`
  color: olive;
\`;

export default function Chart() {
  return <figure class={chart}>chart</figure>;
}
`;

/** What each path's sheets hold, rendered by one dev server in the order given. */
async function render(paths: readonly string[]): Promise<Record<string, string>> {
  const root = project("full-stack", {
    "src/routes/about.tsx": ABOUT,
    "src/routes/index.tsx": INDEX,
    "src/routes/themed.tsx": THEMED,
    "src/routes/heavy.tsx": HEAVY,
    "src/heavy-chart.tsx": CHART,
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
    for (const [index, path] of paths.entries()) {
      const html = await (
        await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: "text/html" } })
      ).text();
      out[paths.indexOf(path) === index ? path : `${path}#${index}`] = [
        ...html.matchAll(/<style id="barq-css(?:-atoms|-late)?"[^>]*>([\s\S]*?)<\/style>/g),
      ]
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

  /**
   * A theme a component installs as it renders is that page's: a request for
   * `/` after one for `/themed` carried its `:root` rules.
   */
  test("holds no sheet another request's render registered, and keeps its own", async () => {
    const pages = await render(["/themed", "/", "/themed"]);
    expect(pages["/themed"]).toContain("--acme-theme:1");
    expect(pages["/"]).not.toContain("--acme-theme");
    expect(pages["/themed#2"]).toContain("--acme-theme:1");
  }, 120_000);

  /**
   * A lazy module is imported once per process, so its rules arrived in the
   * first request's late sheet and in no later request at all.
   */
  test("carries a lazy module's rules on every request, not only the first", async () => {
    const pages = await render(["/heavy", "/heavy"]);
    expect(pages["/heavy"]).toContain("color: olive");
    expect(pages["/heavy#1"]).toContain("color: olive");
  }, 120_000);

  test("holds no rule of a route the page is not", async () => {
    const pages = await render(["/about", "/"]);
    expect(pages["/about"]).toContain("#app");
    expect(pages["/"]).not.toContain("#app");
    expect(pages["/"]).not.toContain("color: teal");
  }, 120_000);
});
