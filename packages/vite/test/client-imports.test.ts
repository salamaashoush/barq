/**
 * The client entries of barq's packages, loaded by a browser from `vite dev`.
 *
 * A development server answers a Node built-in such as `node:async_hooks` in
 * the browser with a stub that throws when a property of it is read. A module
 * that reads one as it loads (a named import, a `process` read at module scope)
 * fails, and with it every module that imports it, up to the page's entry: the
 * server's HTML is on screen and nothing on it responds. A build answers the
 * same import with an empty module and does not throw, so only a dev server in
 * a real browser shows it.
 *
 * The page imports the main entry of each package an application imports on
 * the client, and wires one button to a signal. It must load with no error and
 * the button must count.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ViteDevServer, createServer } from "vite";

import { type Page, withChrome } from "../../compiler/test/chrome.ts";
import barq from "../src/index.ts";

const PACKAGES = fileURLToPath(new URL("../..", import.meta.url));

/** Each package's main entry, as an application imports it in client code. */
const ENTRIES = {
  "@barqjs/core": "createSignal",
  "@barqjs/web": "render",
  "@barqjs/start": "live",
  "@barqjs/router": "Link",
  "@barqjs/query": "QueryClient",
  "@barqjs/form": "createForm",
} as const;

const LINKED = ["core", "web", "start", "router", "query", "form", "server", "css", "compiler"];

const MAIN = `import { createSignal } from "@barqjs/core";
import { render } from "@barqjs/web";
${Object.keys(ENTRIES)
  .map((name, index) => `import * as entry${index} from "${name}";`)
  .join("\n")}

const entries = [${Object.keys(ENTRIES)
  .map((_, index) => `entry${index}`)
  .join(", ")}];
const names = ${JSON.stringify(Object.values(ENTRIES))};
window.__entries = names.map((name, index) => typeof entries[index][name]);

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      clicked {count()}
    </button>
  );
}

render(() => <Counter />, document.getElementById("app"));
`;

/**
 * Installed before the page's own scripts: an uncaught error, a rejected
 * promise and a script that failed to load are all recorded, since a module
 * graph that fails to link or evaluate reports through one of them.
 */
const RECORD_ERRORS = `
window.__errors = [];
window.addEventListener("error", (event) => {
  const source = event.target && event.target !== window ? event.target.src || event.target.href : "";
  window.__errors.push(source ? "failed to load " + source : String(event.message));
}, true);
window.addEventListener("unhandledrejection", (event) => {
  window.__errors.push(String(event.reason && (event.reason.stack || event.reason.message) || event.reason));
});
`;

let root: string;
let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "barq-client-imports-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "client-imports",
      private: true,
      type: "module",
      dependencies: Object.fromEntries(LINKED.map((name) => [`@barqjs/${name}`, "*"])),
    }),
  );
  writeFileSync(
    join(root, "index.html"),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  );
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "main.tsx"), MAIN);
  // Linked the way an install puts them in `node_modules`.
  mkdirSync(join(root, "node_modules", "@barqjs"), { recursive: true });
  for (const name of LINKED) {
    symlinkSync(join(PACKAGES, name), join(root, "node_modules", "@barqjs", name));
  }

  server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    // Vite serves the links from where they point, the workspace, which is
    // outside this project's root.
    server: { host: "127.0.0.1", port: 0, fs: { allow: [root, PACKAGES] } },
    plugins: [await barq({ router: false })],
  });
  await server.listen();
  origin = server.resolvedUrls!.local[0].replace(/\/$/, "");
}, 60_000);

afterAll(async () => {
  await server?.close();
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

async function until(page: Page, expression: string, what: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await page.evaluate<boolean>(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const state = await page.evaluate<string>(
    "JSON.stringify({ url: location.href, errors: window.__errors, body: document.body && document.body.innerHTML })",
  );
  throw new Error(`${what} never happened: ${state}`);
}

describe("client entries under vite dev, in Chrome", () => {
  test("every entry loads, and a button wired to a signal counts", async () => {
    await withChrome(async (page) => {
      await page.send("Page.enable", {});
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_ERRORS });
      await page.send("Page.navigate", { url: `${origin}/` });
      await until(
        page,
        "window.__errors !== undefined && (window.__errors.length > 0 || document.querySelector('button') !== null)",
        "the page rendering its button",
      );

      const errors = await page.evaluate<string[]>("window.__errors");
      expect(errors.filter((error) => error.includes("node:"))).toEqual([]);
      expect(errors).toEqual([]);
      expect(await page.evaluate<string[]>("window.__entries")).toEqual(
        Object.values(ENTRIES).map(() => "function"),
      );

      expect(await page.evaluate<string>("document.querySelector('button').textContent")).toBe(
        "clicked 0",
      );
      const [x, y] = await page.evaluate<[number, number]>(
        "(() => { const box = document.querySelector('button').getBoundingClientRect(); return [box.x + box.width / 2, box.y + box.height / 2]; })()",
      );
      for (const type of ["mousePressed", "mouseReleased"]) {
        await page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      }
      await until(
        page,
        "document.querySelector('button').textContent === 'clicked 1'",
        "the click updating the button",
      );
      expect(await page.evaluate<string[]>("window.__errors")).toEqual([]);
    });
  }, 120_000);
});
