/**
 * P6-Q6b: the same question asked the COMPILED way.
 *
 * `latest()` outside a derivation returns `undefined` for a value that has
 * never resolved (signals.ts:2153 — `currentObserver === null` short-circuits
 * the uninitialized check). The router reads inside `insert`, which is a
 * TRACKED effect, so the untracked answer is the wrong instrument. Trap 2.
 */
import { computed, effect, flush, latest, refresh, runWithOwner, root } from "@barqjs/core";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) { flush(); await new Promise((r) => setTimeout(r, 6)); }
};

let n = 0;
const cell = runWithOwner(null, () =>
  computed(async () => { const mine = ++n; await new Promise((r) => setTimeout(r, 25)); return `v${mine}`; }, { key: "q6b" }),
);

const log: string[] = [];
root(() => {
  effect(() => {
    try { log.push(`latest=${String(latest(cell))}`); }
    catch (e) { log.push(`latest threw ${(e as Error).name}`); }
  });
  effect(() => {
    try { log.push(`plain=${String(cell())}`); }
    catch (e) { log.push(`plain threw ${(e as Error).name}`); }
  });
});

flush();
console.log("cold   :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("warm   :", JSON.stringify(log)); log.length = 0;
refresh(cell); flush();
console.log("stale  :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("settled:", JSON.stringify(log));
console.log("invocations:", n);
