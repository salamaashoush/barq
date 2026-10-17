/**
 * A `<select>`'s value against options that are not there yet, in a REAL
 * browser.
 *
 * happy-dom keeps a value written to a select that has no option carrying it
 * and answers with it once one arrives. No browser does: the write is dropped,
 * the first option that turns up is selected, and a suite that runs on
 * happy-dom alone is green over a select showing the wrong thing.
 *
 * The last row is the CONTROL: the same page with the property written and
 * nothing kept, which has to show some other option or the rows above it prove
 * nothing.
 */

import { fixturePage, openFixturePage, type Page } from "./chrome.ts";

const FIXTURE = `import { For, render, createSignal, flush } from "@barqjs/core"

const [choice, setChoice] = createSignal("grace")
const [names, setNames] = createSignal<string[]>([])
const [grouped, setGrouped] = createSignal<string[]>([])

function Form() {
  return (
    <div>
      <select id="late" value={choice()}>
        <For each={names()}>{(name) => <option value={name}>{name}</option>}</For>
      </select>
      <select id="grouped" value={choice()}>
        <optgroup label="people">
          <For each={grouped()}>{(name) => <option value={name}>{name}</option>}</For>
        </optgroup>
      </select>
      <select id="free" value="grace">
        <For each={names()}>{(name) => <option value={name}>{name}</option>}</For>
      </select>
    </div>
  )
}

const host = document.createElement("div")
document.body.appendChild(host)
render(Form as never, host)

Object.assign(window, {
  __barqNames: (next: string[]) => { setNames(next); flush() },
  __barqGrouped: (next: string[]) => { setGrouped(next); flush() },
  __barqChoice: (next: string) => { setChoice(next); flush() },
  __barqReady: true,
})
`;

const NAIVE_SHIM = `export * from "@barqjs/core"

export function setLive(element, name, value) {
  element[name] = value
  return value
}
`;

export interface SelectRow {
  what: string;
  shows: string;
  wanted: string;
  ok: boolean;
}

export interface SelectReport {
  rows: SelectRow[];
  /** The naive channel. It MUST show an option the value does not name. */
  control: SelectRow;
}

/** Run a step, let the page's microtasks drain, and read what a select shows. */
async function shown(page: Page, id: string, step: string): Promise<string> {
  return page.evaluate<string>(
    `(async () => { ${step}; await new Promise((r) => setTimeout(r, 0)); ` +
      `return document.getElementById(${JSON.stringify(id)}).value })()`,
  );
}

function row(what: string, shows: string, wanted: string): SelectRow {
  return { what, shows, wanted, ok: shows === wanted };
}

const PEOPLE = JSON.stringify(["ada", "grace", "edsger"]);

export async function checkSelect(page: Page): Promise<SelectReport> {
  const rows: SelectRow[] = [];

  const real = await fixturePage("select", FIXTURE);
  try {
    await openFixturePage(page, "select", real.path);
    rows.push(
      row(
        "the options arrive after the value was written",
        await shown(page, "late", `window.__barqNames(${PEOPLE})`),
        "grace",
      ),
    );
    rows.push(
      row(
        "the list is emptied and built again",
        await shown(page, "late", `window.__barqNames([]); window.__barqNames(${PEOPLE})`),
        "grace",
      ),
    );
    rows.push(
      row(
        "the options arrive inside an optgroup",
        await shown(page, "grouped", `window.__barqGrouped(${PEOPLE})`),
        "grace",
      ),
    );
    rows.push(
      row(
        "the value moves to an option that is already there",
        await shown(page, "late", `window.__barqChoice("edsger")`),
        "edsger",
      ),
    );
    rows.push(
      row(
        "a choice the user made survives an option arriving beside it",
        await shown(
          page,
          "free",
          `const free = document.getElementById("free"); free.value = "ada"; ` +
            `free.dispatchEvent(new Event("change", { bubbles: true })); ` +
            `window.__barqNames(["ada", "grace", "edsger", "barbara"])`,
        ),
        "ada",
      ),
    );
  } finally {
    real.cleanup();
  }

  const naive = await fixturePage("select", FIXTURE, NAIVE_SHIM);
  try {
    await openFixturePage(page, "select", naive.path);
    const shows = await shown(page, "late", `window.__barqNames(${PEOPLE})`);
    return {
      rows,
      control: {
        what: "the property written and nothing kept",
        shows,
        wanted: "anything but grace",
        ok: shows !== "grace",
      },
    };
  } finally {
    naive.cleanup();
  }
}

export function formatSelect(report: SelectReport): string {
  return [...report.rows, report.control]
    .map((entry) => `  ${entry.ok ? "ok  " : "FAIL"} ${entry.what}: shows ${entry.shows}`)
    .join("\n");
}
