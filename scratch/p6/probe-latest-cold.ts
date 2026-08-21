/**
 * P6-Q6: does `latest()` give BOTH halves of `staleReloadMode` for free?
 *
 *  - cold (never resolved)  -> must THROW, so the boundary parks and the
 *    fallback shows.  A background read of a value that does not exist yet is
 *    not "background", it is "blank".
 *  - stale (has resolved, refreshing) -> must return the previous value.
 *
 * If both hold, `staleReloadMode: 'background' | 'blocking'` is a choice of
 * READ, not a state machine.
 */
import { computed, flush, latest, refresh, runWithOwner } from "@barqjs/core";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) { flush(); await new Promise((r) => setTimeout(r, 6)); }
};
const attempt = (label: string, fn: () => unknown): void => {
  try { console.log(label, "->", `value=${String(fn())}`); }
  catch (e) { console.log(label, "->", `threw ${(e as Error).name}`); }
};

let n = 0;
const cell = runWithOwner(null, () =>
  computed(async () => { const mine = ++n; await new Promise((r) => setTimeout(r, 20)); return `v${mine}`; }, { key: "q6" }),
);

attempt("cold   latest(cell)  ", () => latest(cell));
attempt("cold   cell()        ", () => cell());
await settle();
attempt("warm   latest(cell)  ", () => latest(cell));
refresh(cell); flush();
attempt("stale  latest(cell)  ", () => latest(cell));
attempt("stale  cell()        ", () => cell());
await settle();
attempt("settled latest(cell) ", () => latest(cell));
console.log("invocations:", n);
