/**
 * B7's acceptance test: a REAL browser, typing REAL keystrokes.
 *
 * Everything else in this directory drives forms with `dispatchEvent`, which
 * synthesises the report of an edit without ever entering the browser's editing
 * code. That is enough to pin the arithmetic — which offsets are saved, how they
 * are clamped — and it is not enough to pin the thing B7 is about. A synthetic
 * `input` event moves no caret, so a channel that destroyed the caret on every
 * write would still pass a happy-dom suite that only ever moved the caret
 * itself.
 *
 * So here the caret is moved by Chrome: `Input.dispatchKeyEvent` over CDP puts
 * characters into a focused field through the same path a human keyboard takes,
 * and `selectionStart` afterwards is the browser's own answer.
 *
 * This project has shipped the failure this check exists for. Replace-based
 * hydration lost focus and discarded typed input at every page size; it was
 * caught by MEASURING and not by testing, and the lesson taken was that a
 * keystroke has to come from something that can actually type.
 *
 * The last row is the CONTROL, and without it none of the others is evidence:
 * it drives the same page with the DOM-compare and the caret restore both
 * DISABLED — the mutation, run in the browser — and requires the caret to be
 * destroyed. A check that cannot show the failure is not checking for it.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "./chrome.ts";
import { compileSource, TMP_DIR } from "./harness.ts";

const PRAGMA = "/** @jsxImportSource @barqjs/core */\n";

/**
 * The page's own source. A module-level signal, a `bind:value` input, a
 * textarea, and a `writeFrom(...)` the driver calls to produce the external
 * write — which is the whole scenario: something other than the user changes
 * the bound value while the user is inside the field.
 */
const FIXTURE = `import { render, signal } from "@barqjs/core"

export const text = signal("hello world")
export const notes = signal("first line")

function Form() {
  return (
    <div>
      <input type="text" id="field" bind:value={text} />
      <textarea id="area" bind:value={notes} />
    </div>
  )
}

const host = document.createElement("div")
document.body.appendChild(host)
render(Form as never, host)

Object.assign(window, {
  __barqWrite: (which: string, value: string) => {
    if (which === "field") text.set(value)
    else notes.set(value)
  },
  __barqRead: (which: string) => (which === "field" ? text() : notes()),
  __barqReady: true,
})
`;

/**
 * The MUTATION, applied to the emitted module rather than to the runtime: the
 * page imports a `@barqjs/core` whose `bindValue` writes the property with no
 * DOM-compare and no caret restore. That is the pre-M7 channel exactly, and it
 * is what the control row runs.
 */
const NAIVE_SHIM = `export * from "@barqjs/core"
import { bindEffect, listen } from "@barqjs/core"

export function bindValue(s, element, name, type, value) {
  bindEffect(s, () => { element[name] = value() })
  listen(s, element, type, () => { value.set(element[name]) })
}
`;

export interface CaretRow {
  /** what was driven */
  what: string;
  /** what the control held after the browser typed into it */
  afterTyping: string;
  /** the control the row is about */
  target: string;
  /** the caret before the external write */
  before: string;
  /** the caret after it */
  after: string;
  /** the value the field held when the row finished */
  value: string;
  /** whether the field still had the focus */
  focused: boolean;
  /** the row's own verdict */
  ok: boolean;
  /** why, when it is not ok */
  why: string;
}

export interface CaretReport {
  rows: CaretRow[];
  /** The control row, run against the naive channel. It MUST report a loss. */
  control: CaretRow;
}

async function buildPage(naive: boolean): Promise<{ path: string; cleanup: () => void }> {
  // Inside the package: the bundle imports `@barqjs/core`, and a workdir in
  // the system temp has no node_modules above it to resolve it from.
  const workdir = join(TMP_DIR, `caret-${naive ? "naive" : "real"}`);
  rmSync(workdir, { recursive: true, force: true });
  mkdirSync(workdir, { recursive: true });

  let code = compileSource(FIXTURE, "caret.tsx");
  if (naive) {
    writeFileSync(join(workdir, "core-naive.ts"), NAIVE_SHIM);
    code = code.replaceAll('from "@barqjs/core"', 'from "./core-naive.ts"');
  }
  writeFileSync(join(workdir, "entry.tsx"), PRAGMA + code);

  const built = await Bun.build({
    entrypoints: [join(workdir, "entry.tsx")],
    target: "browser",
    format: "esm",
    conditions: ["bun"],
  });
  if (!built.success) {
    for (const log of built.logs) console.error(String(log));
    throw new Error("the caret page did not build");
  }
  const path = join(workdir, "page.html");
  writeFileSync(
    path,
    `<!doctype html><meta charset="utf-8"><title>barq caret</title>` +
      `<script>window.addEventListener("error", (e) => { window.__barqLoadError ??= ` +
      `String((e.error && e.error.stack) || e.message) });</script>` +
      `<script type="module">\n${(await built.outputs[0]!.text()).replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
  return { path, cleanup: () => rmSync(workdir, { recursive: true, force: true }) };
}

/** One character, through the browser's own editing code. */
async function typeChar(page: Page, ch: string): Promise<void> {
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: ch,
    unmodifiedText: ch,
    key: ch,
  });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
}

interface Caret {
  start: number;
  end: number;
  direction: string;
  value: string;
  focused: boolean;
}

function caretOf(id: string): string {
  return `(() => { const el = document.getElementById(${JSON.stringify(id)});
    return JSON.stringify({ start: el.selectionStart, end: el.selectionEnd,
      direction: el.selectionDirection, value: el.value,
      focused: document.activeElement === el }) })()`;
}

async function readCaret(page: Page, id: string): Promise<Caret> {
  return JSON.parse(await page.evaluate<string>(caretOf(id))) as Caret;
}

async function settle(page: Page): Promise<void> {
  await page.evaluate<boolean>(
    "new Promise((r) => { queueMicrotask(() => requestAnimationFrame(() => r(true))) })",
  );
}

/**
 * Focus, type through CDP, select a range, then write the bound signal from
 * elsewhere — and report the caret on both sides of that write.
 */
async function driveOne(
  page: Page,
  id: string,
  typed: string,
  select: [number, number],
  external: string,
): Promise<{ before: Caret; after: Caret; typed: boolean }> {
  await page.evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`);
  await page.evaluate(`document.getElementById(${JSON.stringify(id)}).setSelectionRange(5, 5)`);
  const seeded = (await readCaret(page, id)).value;
  for (const ch of typed) await typeChar(page, ch);
  await settle(page);
  await page.evaluate(
    `document.getElementById(${JSON.stringify(id)}).setSelectionRange(${select[0]}, ${select[1]}, "backward")`,
  );
  const before = await readCaret(page, id);
  await page.evaluate(`window.__barqWrite(${JSON.stringify(id)}, ${JSON.stringify(external)})`);
  await settle(page);
  const after = await readCaret(page, id);
  // Whether Chrome's editing code actually ran. Without this the whole check
  // passes on a browser that ignored every keystroke, which is the same green
  // as a happy-dom suite and the reason this file exists.
  const didType = seeded !== before.value && before.value.includes(typed);
  return { before, after, typed: didType };
}

function judge(
  what: string,
  target: string,
  before: Caret,
  after: Caret,
  wantValue: string,
  typed = true,
): CaretRow {
  const reasons: string[] = [];
  if (!typed) {
    reasons.push("the browser typed nothing, so this row observed no keystroke at all");
  }
  if (after.value !== wantValue) {
    reasons.push(`the external write never landed: the field reads ${JSON.stringify(after.value)}`);
  }
  if (after.start !== before.start || after.end !== before.end) {
    reasons.push(
      `the caret moved from ${before.start}..${before.end} to ${after.start}..${after.end}`,
    );
  }
  if (!after.focused) reasons.push("the field lost focus to the write");
  return {
    what,
    target,
    afterTyping: before.value,
    before: `${before.start}..${before.end} (${before.direction})`,
    after: `${after.start}..${after.end} (${after.direction})`,
    value: after.value,
    focused: after.focused,
    ok: reasons.length === 0,
    why: reasons.join("; "),
  };
}

export async function checkCaret(page: Page): Promise<CaretReport> {
  const rows: CaretRow[] = [];

  const real = await buildPage(false);
  try {
    await page.open(`file://${real.path}`);
    let ready = false;
    for (let attempt = 0; attempt < 400 && !ready; attempt++) {
      ready = await page.evaluate<boolean>("window.__barqReady === true");
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
      const reason = await page.evaluate<string>("String(window.__barqLoadError || '')");
      throw new Error(`the caret page never loaded${reason ? `:\n${reason}` : ""}`);
    }

    const field = await driveOne(page, "field", "XY", [2, 7], "hello there world");
    rows.push(
      judge(
        "type two characters, select 2..7, then write the signal from elsewhere",
        "input[type=text]",
        field.before,
        field.after,
        "hello there world",
        field.typed,
      ),
    );

    const area = await driveOne(page, "area", "AB", [3, 6], "second line here");
    rows.push(
      judge(
        "the same, in a textarea",
        "textarea",
        area.before,
        area.after,
        "second line here",
        area.typed,
      ),
    );

    // The compare's own row: a write of the value the field already holds must
    // not touch the caret at all, because it must not write at all.
    await page.evaluate(`document.getElementById("field").focus()`);
    await page.evaluate(`document.getElementById("field").setSelectionRange(3, 8, "backward")`);
    const same = await readCaret(page, "field");
    await page.evaluate(`window.__barqWrite("field", ${JSON.stringify(same.value)})`);
    await settle(page);
    rows.push(
      judge(
        "write the value the field already holds — the DOM-compare must skip it",
        "input[type=text]",
        same,
        await readCaret(page, "field"),
        same.value,
      ),
    );
  } finally {
    real.cleanup();
  }

  // The control: the same drive, against a channel with neither half.
  const naive = await buildPage(true);
  let control: CaretRow;
  try {
    await page.open(`file://${naive.path}`);
    let ready = false;
    for (let attempt = 0; attempt < 400 && !ready; attempt++) {
      ready = await page.evaluate<boolean>("window.__barqReady === true");
      if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
      const reason = await page.evaluate<string>("String(window.__barqLoadError || '')");
      throw new Error(`the control page never loaded${reason ? `:\n${reason}` : ""}`);
    }
    const field = await driveOne(page, "field", "XY", [2, 7], "hello there world");
    const row = judge(
      "MUTATION: no DOM-compare and no caret restore",
      "input[type=text]",
      field.before,
      field.after,
      "hello there world",
    );
    // Inverted: this row is correct when the caret was LOST.
    control = {
      ...row,
      ok: !row.ok && row.why.includes("the caret moved"),
      why: row.ok
        ? "the naive channel kept the caret, so this check cannot tell the two apart"
        : row.why,
    };
  } finally {
    naive.cleanup();
  }

  return { rows, control };
}

export function formatCaret(report: CaretReport): string {
  const line = (row: CaretRow): string =>
    `  ${row.ok ? "OK  " : "LOST"}  ${row.target.padEnd(18)} caret ${row.before} → ${row.after}` +
    `  typed=${JSON.stringify(row.afterTyping)} written=${JSON.stringify(row.value)}` +
    `${row.why ? `  — ${row.why}` : ""}`;
  return [
    ...report.rows.map(line),
    `  ${report.control.ok ? "OK  " : "BLIND"}  control (mutated): ${report.control.before} → ` +
      `${report.control.after}${report.control.why ? `  — ${report.control.why}` : ""}`,
  ].join("\n");
}
