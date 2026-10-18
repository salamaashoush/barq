/**
 * A real `WebGLRenderer` in headless Chrome: the scene draws, and under the
 * default `demand` frameloop a signal write redraws it once and an idle scene
 * is not redrawn at all. Pixels are read back from the drawing buffer.
 *
 * Chrome is required, as for the compiler's browser suite: set CHROME_PATH.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { withChrome, type Page } from "../../compiler/test/chrome.ts";
import { barqPlugin } from "./test-setup.ts";

const OUT = join(import.meta.dir, "..", "node_modules", `.barq-browser-${process.pid}`);
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

/** Software WebGL, so a headless Chrome on any machine has a context to draw into. */
const WEBGL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function buildPage(): Promise<string> {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, "fixtures", "browser.tsx")],
    target: "browser",
    format: "esm",
    conditions: ["bun"],
    plugins: [barqPlugin],
  });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, "page.html");
  const script = (await built.outputs[0].text()).replace(/<\/script/gi, "<\\/script");
  writeFileSync(
    path,
    '<!doctype html><meta charset="utf-8"><body style="margin:0"><div id="app"></div>' +
      `<script>window.addEventListener("error", (e) => { window.__error ??= String((e.error && e.error.stack) || e.message) });</script>` +
      `<script type="module">\n${script}\n</script>`,
  );
  return path;
}

async function until(page: Page, expression: string, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await page.evaluate<boolean>(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const error = await page.evaluate<string>("String(window.__error || '')");
  throw new Error(`timed out waiting for ${what}${error ? `:\n${error}` : ""}`);
}

const frame = (page: Page): Promise<unknown> =>
  page.evaluate(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );

test("a mesh draws, a signal write redraws it once, and an idle scene is not redrawn", async () => {
  const path = await buildPage();
  await withChrome(
    async (chrome) => {
      await chrome.open(`file://${path}`);
      await until(chrome, "window.__three?.renders >= 1", "the first frame");
      // The canvas is measured once it is laid out, which asks for one more
      // frame at its real size; after that nothing changes.
      for (let i = 0; i < 5; i++) await frame(chrome);
      const settled = await chrome.evaluate<number>("window.__three.renders");
      expect(settled).toBeLessThanOrEqual(2);
      expect(await chrome.evaluate<number[]>("window.__three.pixel()")).toEqual([255, 0, 0, 255]);

      for (let i = 0; i < 10; i++) await frame(chrome);
      expect(await chrome.evaluate<number>("window.__three.renders")).toBe(settled);

      await chrome.evaluate("window.__three.setColor('#0000ff')");
      await until(
        chrome,
        `window.__three.renders === ${settled + 1}`,
        "the frame the write asked for",
      );
      expect(await chrome.evaluate<number[]>("window.__three.pixel()")).toEqual([0, 0, 255, 255]);

      for (let i = 0; i < 10; i++) await frame(chrome);
      expect(await chrome.evaluate<number>("window.__three.renders")).toBe(settled + 1);
    },
    { flags: WEBGL },
  );
}, 120_000);
