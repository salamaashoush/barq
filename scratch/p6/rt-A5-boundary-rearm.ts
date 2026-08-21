/**
 * RED-A5: `flow.ts:1160-1170` re-arms the fallback only
 *   `if (!first && value !== last && untrack(() => pending.count()) > 0)`.
 * With a `latest()` read the body never parks -> `pending.count()` is 0.
 * What happens on a navigation whose new entry is COLD?
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "http://localhost/" });

const core = await import("@barqjs/core");
const { computed, latest, signal, flush, scope, block, boundary, render, runWithOwner } = core as never as {
  computed: typeof import("@barqjs/core").computed;
  latest: typeof import("@barqjs/core").latest;
  signal: typeof import("@barqjs/core").signal;
  flush: typeof import("@barqjs/core").flush;
  scope: (fn: () => unknown) => unknown;
  block: (fn: (s: unknown) => unknown) => unknown;
  boundary: (...a: unknown[]) => unknown;
  render: (el: unknown, c: unknown) => unknown;
  runWithOwner: typeof import("@barqjs/core").runWithOwner;
};

const tick = async (): Promise<void> => { flush(); await new Promise((r) => setTimeout(r, 4)); flush(); };
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await tick(); };

const container = document.createElement("div");
document.body.append(container);

const key = signal("a");
const cells = new Map<string, () => unknown>();
let fetches = 0;
const cellFor = (k: string): (() => unknown) => {
  const found = cells.get(k);
  if (found !== undefined) return found;
  const made = runWithOwner(null, () =>
    computed(async () => { fetches++; await new Promise((r) => setTimeout(r, 60)); return `DATA-${k}`; }, { key: `rtA5:${k}` }),
  ) as unknown as () => unknown;
  cells.set(k, made);
  return made;
};

const MODE = (process.argv[2] ?? "latest") as "latest" | "plain";

const body = block((_s: unknown) => {
  const k = key();
  const cell = cellFor(k);
  const value = MODE === "latest" ? latest(cell as never) : (cell as () => unknown)();
  return document.createTextNode(String(value));
});

scope(() => {
  const el = boundary(null, null, null, "loading", block(() => document.createTextNode("FALLBACK")), body, 0, () => key());
  render(el, container);
});

await tick();
console.log(`[${MODE}] cold             :`, JSON.stringify(container.textContent));
await settle();
console.log(`[${MODE}] settled          :`, JSON.stringify(container.textContent), "fetches", fetches);
key.set("b");
await tick();
console.log(`[${MODE}] navigated (+tick):`, JSON.stringify(container.textContent));
await settle();
console.log(`[${MODE}] after settle     :`, JSON.stringify(container.textContent), "fetches", fetches);
