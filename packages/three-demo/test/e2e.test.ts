/**
 * The production build, served by `bun dist/server/serve.js` and driven in a
 * headless Chrome with software WebGL: the server's HTML, hydration, a drawn
 * scene, a click on a planet, demand rendering, and a client navigation away
 * from the scene and back.
 *
 * Chrome is required, as for the compiler's browser suite: set CHROME_PATH.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { withChrome, type Page } from "../../compiler/test/chrome.ts";

const ROOT = join(import.meta.dir, "..");
const PORT = 5300 + (process.pid % 500);
const ORIGIN = `http://localhost:${PORT}`;

/** Software WebGL, so a headless Chrome on any machine has a context to draw into. */
const WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

/**
 * Runs before the page's own scripts. It records console warnings and errors,
 * counts WebGL contexts made and lost, keeps the drawing buffer so a pixel can
 * be read back between frames, and holds on to the server's `#bodies` list so
 * the test can tell hydration claimed it rather than rebuilt it. That is read
 * when parsing ends, before any module script runs.
 */
const PROBE = `(() => {
  window.__logs = [];
  for (const level of ["error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      window.__logs.push(level + ": " + args.map((a) => (a && a.stack) || String(a)).join(" "));
      original(...args);
    };
  }
  window.addEventListener("error", (e) => window.__logs.push("error: " + e.message));
  window.__gl = { created: 0, lost: 0 };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    const webgl = /webgl/.test(type);
    const known = this.__context;
    const context = getContext.call(this, type, webgl ? { ...attributes, preserveDrawingBuffer: true } : attributes);
    if (webgl && context && !known) {
      this.__context = context;
      window.__gl.created++;
      this.addEventListener("webglcontextlost", () => window.__gl.lost++);
    }
    return context;
  };
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "interactive") window.__served = document.getElementById("bodies");
  });
})();`;

let server: ChildProcess | undefined;

beforeAll(async () => {
  const built = spawnSync(
    join(ROOT, "node_modules", ".bin", "vite"),
    ["build", "--logLevel", "error"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  if (built.status !== 0) throw new Error(`vite build failed:\n${built.stdout}\n${built.stderr}`);
  server = spawn("bun", [join(ROOT, "dist", "server", "serve.js")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${ORIGIN}/catalogue`)).ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the built server did not answer on ${ORIGIN}`);
}, 120_000);

afterAll(() => {
  server?.kill();
});

test("the server renders the panel from the loader and a bare canvas, with no three.js in it", async () => {
  const html = await (await fetch(`${ORIGIN}/`)).text();
  expect(html).toContain('<canvas style="display: block;"></canvas>');
  for (const id of ["mercury", "earth", "jupiter", "neptune"]) {
    expect(html).toContain(`data-body="${id}"`);
  }
  expect(html).toMatch(/id="seed">seed <!--\[-->\d+/);
  expect(html).not.toContain("data-planet");

  const serverCode = readdirSync(join(ROOT, "dist", "server"), { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(ROOT, "dist", "server", file), "utf8"))
    .join("\n");
  for (const name of ["WebGLRenderer", "PerspectiveCamera", "OrbitControls", "BufferGeometry"]) {
    expect(serverCode).not.toContain(name);
  }

  const catalogue = await (await fetch(`${ORIGIN}/catalogue`)).text();
  expect(catalogue.match(/<tr data-planet="/g)?.length).toBe(8);
  expect(catalogue).not.toContain("<canvas");
});

async function until(page: Page, expression: string, what: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await page.evaluate<boolean>(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const logs = await page.evaluate<string[]>("window.__logs ?? []");
  throw new Error(`timed out waiting for ${what}\n${logs.join("\n")}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const frames = (page: Page): Promise<number> =>
  page.evaluate<number>("Number(document.querySelector('#frames').textContent)");

/** A real mouse click, through the browser's input pipeline rather than `dispatchEvent`. */
async function click(page: Page, x: number, y: number): Promise<void> {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

async function clickElement(page: Page, selector: string): Promise<void> {
  const at = await page.evaluate<{ x: number; y: number }>(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  );
  await click(page, at.x, at.y);
}

/** How many of the drawn pixels are lit, out of a grid sampled over the whole buffer. */
const LIT = `(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas.__context;
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let lit = 0;
  let sampled = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * 4;
      sampled++;
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 120) lit++;
    }
  }
  const centre = ((height >> 1) * width + (width >> 1)) * 4;
  return { lit, sampled, centre: [pixels[centre], pixels[centre + 1], pixels[centre + 2]] };
})()`;

interface Lit {
  lit: number;
  sampled: number;
  centre: [number, number, number];
}

function expectScene(lit: Lit): void {
  // The Sun sits at the middle of the view and is drawn near white-yellow.
  expect(lit.centre[0]).toBeGreaterThan(200);
  expect(lit.centre[1]).toBeGreaterThan(170);
  // The planets, belt and stars light a few percent of a mostly black sky.
  expect(lit.lit / lit.sampled).toBeGreaterThan(0.02);
}

test("hydrates without a mismatch, draws, selects on click, and remounts after navigation", async () => {
  await withChrome(
    async (page) => {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.send("Page.enable", {});
      await page.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
      await page.send("Page.navigate", { url: `${ORIGIN}/` });
      await until(page, "Number(document.querySelector('#frames')?.textContent) > 0", "frames");
      await until(page, "document.querySelectorAll('span[data-planet]').length === 8", "labels");

      // Hydration claimed the server's list: the node is the one the parser built.
      expect(
        await page.evaluate<boolean>("window.__served === document.getElementById('bodies')"),
      ).toBe(true);
      expect(await page.evaluate<number>("window.__gl.created")).toBe(1);

      // Paused under the demand frameloop, nothing draws.
      await clickElement(page, "#play");
      await until(page, "document.querySelector('#play').textContent === 'Play'", "the pause");
      await sleep(500);
      const idle = await frames(page);
      await sleep(1000);
      expect(await frames(page)).toBe(idle);

      expectScene(await page.evaluate<Lit>(LIT));

      // A click on Jupiter's centre, where its label is anchored, selects it.
      const jupiter = await page.evaluate<{ x: number; y: number }>(`(() => {
        const anchor = document.querySelector('span[data-planet="jupiter"]').parentElement.parentElement;
        const [, x, y] = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/.exec(anchor.style.transform);
        const host = anchor.parentElement.getBoundingClientRect();
        return { x: host.left + Number(x), y: host.top + Number(y) };
      })()`);
      await click(page, jupiter.x, jupiter.y);
      await until(
        page,
        "document.querySelector('#selected h3')?.textContent === 'Jupiter'",
        "the selection",
      );
      expect(
        await page.evaluate<string>(
          "document.querySelector('[data-body=\"jupiter\"]').getAttribute('aria-pressed')",
        ),
      ).toBe("true");
      expect(
        await page.evaluate<boolean>(
          "document.querySelector('span[data-planet=\"jupiter\"]').hasAttribute('data-lit')",
        ),
      ).toBe(true);

      // A DOM control writes a signal the scene reads, which draws once more.
      const before = await frames(page);
      await clickElement(page, '[data-body="saturn"]');
      await until(
        page,
        "document.querySelector('span[data-planet=\"saturn\"]').hasAttribute('data-lit')",
        "Saturn lit",
      );
      await sleep(500);
      expect(await frames(page)).toBeGreaterThan(before);

      // Away to a page with no canvas: the scene goes, and its context with it.
      await page.evaluate("window.__marker = 'same document'");
      await clickElement(page, 'nav a[href="/catalogue"]');
      await until(
        page,
        "document.querySelectorAll('#catalogue tbody tr').length === 8",
        "the catalogue",
      );
      expect(await page.evaluate<string>("location.pathname")).toBe("/catalogue");
      expect(await page.evaluate<string>("window.__marker")).toBe("same document");
      expect(
        await page.evaluate<number>(
          "document.querySelectorAll('canvas, span[data-planet]').length",
        ),
      ).toBe(0);
      expect(await page.evaluate<{ created: number; lost: number }>("window.__gl")).toEqual({
        created: 1,
        lost: 1,
      });

      // And back: a new scene on a new context, drawing again.
      await clickElement(page, 'nav a[href="/"]');
      await until(
        page,
        "Number(document.querySelector('#frames')?.textContent) > 0",
        "frames again",
      );
      await until(
        page,
        "document.querySelectorAll('span[data-planet]').length === 8",
        "labels again",
      );
      expect(await page.evaluate<string>("window.__marker")).toBe("same document");
      expect(await page.evaluate<{ created: number; lost: number }>("window.__gl")).toEqual({
        created: 2,
        lost: 1,
      });
      // Built in the browser this time, not parsed: the asteroid slider's value
      // has to be written after its `max`, or it is clamped to 100.
      expect(
        await page.evaluate<string[]>(
          "[...document.querySelectorAll('input[type=range]')].map((input) => input.value)",
        ),
      ).toEqual(["40", "2500"]);
      await clickElement(page, "#play");
      await until(
        page,
        "document.querySelector('#play').textContent === 'Play'",
        "the second pause",
      );
      await sleep(300);
      expectScene(await page.evaluate<Lit>(LIT));

      const logs = await page.evaluate<string[]>("window.__logs");
      expect(logs).toEqual([]);
    },
    { flags: WEBGL },
  );
}, 180_000);
