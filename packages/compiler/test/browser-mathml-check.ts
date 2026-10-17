/**
 * MathML rows in a REAL browser.
 *
 * happy-dom parses `<math>` as HTML, so nothing it runs can tell a MathML
 * element from an unknown HTML one. A browser can: the unknown element lays out
 * as inline text and the formula falls apart.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "./chrome.ts";
import { compileSource, TMP_DIR } from "./harness.ts";

const PRAGMA = "/** @jsxImportSource @barqjs/web */\n";

const FIXTURE = `import { For, createSignal, flush } from "@barqjs/core"
import { render } from "@barqjs/web"

const [names, setNames] = createSignal(["x", "y"])
function Variable(props) { return <mi mathvariant="bold">{props.name()}</mi> }

function Formula() {
  return (
    <math display="block">
      <mrow>
        <For each={names()}>{(name) => <mi>{name}</mi>}</For>
        <Variable name="z" />
      </mrow>
    </math>
  )
}

const host = document.createElement("div")
document.body.appendChild(host)
render(Formula as never, host)
setNames(["x", "y", "w"])
flush()

Object.assign(window, { __barqReady: true })
`;

export interface MathReport {
  /** `text@namespace` for every `<mi>` on the page, in document order. */
  identifiers: string[];
}

export async function checkMathml(page: Page): Promise<MathReport> {
  const workdir = join(TMP_DIR, "mathml");
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });
  writeFileSync(join(workdir, "entry.tsx"), PRAGMA + compileSource(FIXTURE, "mathml.tsx"));
  const built = await Bun.build({
    entrypoints: [join(workdir, "entry.tsx")],
    target: "browser",
    format: "esm",
    conditions: ["bun"],
  });
  if (!built.success) {
    for (const log of built.logs) console.error(String(log));
    throw new Error("the MathML page did not build");
  }
  const path = join(workdir, "page.html");
  writeFileSync(
    path,
    `<!doctype html><meta charset="utf-8"><title>barq mathml</title>` +
      `<script>window.addEventListener("error", (e) => { window.__barqLoadError ??= ` +
      `String((e.error && e.error.stack) || e.message) });</script>` +
      `<script type="module">\n${(await built.outputs[0]!.text()).replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
  try {
    await page.open(`file://${path}`);
    let ready = false;
    for (let attempt = 0; attempt < 400 && !ready; attempt++) {
      ready = await page.evaluate<boolean>("window.__barqReady === true");
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
      const reason = await page.evaluate<string>("String(window.__barqLoadError || '')");
      throw new Error(`the MathML page never loaded${reason ? `:\n${reason}` : ""}`);
    }
    const identifiers = await page.evaluate<string[]>(
      "[...document.querySelectorAll('mi')].map((node) => node.textContent + '@' + node.namespaceURI)",
    );
    return { identifiers };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}
