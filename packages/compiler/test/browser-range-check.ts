/**
 * A range input's value against the `max` it is given, in a REAL browser.
 *
 * The browser sanitizes a written `value` against `min`, `max` and `step` as
 * they stand at that moment, so a value written before its `max` is clamped to
 * the default 100 and stays there. The compiler wrote the value first whenever
 * an effect group's first run stood ahead of a `max` the group does not own, or
 * when the value was simply spelled first.
 *
 * The CONTROL writes the value and then the max by hand, which has to show 100
 * or the rows above it prove nothing.
 */

import { fixturePage, openFixturePage, type Page } from "./chrome.ts";

const FIXTURE = `import { createSignal } from "@barqjs/core"
import { render } from "@barqjs/web"

const MAX = Number("6000")

function Sliders() {
  const [count] = createSignal(2500)
  const [limit] = createSignal(6000)
  const [hint] = createSignal("rocks")
  return (
    <label title={hint()}>
      <input id="opaque" type="range" value={count()} min="0" max={MAX} step="100" />
      <input id="spelled" type="range" value={count()} max={limit()} />
    </label>
  )
}

const host = document.createElement("div")
document.body.appendChild(host)
render(Sliders as never, host)

Object.assign(window, { __barqReady: true })
`;

export interface RangeRow {
  what: string;
  shows: string;
  wanted: string;
  ok: boolean;
}

export interface RangeReport {
  rows: RangeRow[];
  /** The value written before the max, by hand. It MUST be clamped. */
  control: RangeRow;
}

function row(what: string, shows: string, wanted: string): RangeRow {
  return { what, shows, wanted, ok: shows === wanted };
}

const valueOf = (page: Page, id: string): Promise<string> =>
  page.evaluate<string>(`document.getElementById(${JSON.stringify(id)}).value`);

export async function checkRange(page: Page): Promise<RangeReport> {
  const built = await fixturePage("range", FIXTURE);
  try {
    await openFixturePage(page, "range", built.path);
    const rows = [
      row(
        "a max the effect group does not own, after the group's first member",
        await valueOf(page, "opaque"),
        "2500",
      ),
      row("a reactive max spelled after the value", await valueOf(page, "spelled"), "2500"),
    ];
    const shows = await page.evaluate<string>(
      `(() => { const input = document.createElement("input"); input.type = "range"; ` +
        `input.value = "2500"; input.max = "6000"; return input.value })()`,
    );
    return {
      rows,
      control: { what: "value written before max", shows, wanted: "100", ok: shows === "100" },
    };
  } finally {
    built.cleanup();
  }
}
