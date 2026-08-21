/**
 * RED-A2: `latest()` when a refresh is SUPERSEDED by a third refresh mid-flight.
 * Design §1.1 claims the three-row table is "the whole of staleReloadMode".
 * Does the value that finally lands belong to the LAST refresh?
 */
import { computed, effect, flush, latest, refresh, root, runWithOwner } from "@barqjs/core";

const settle = async (ms = 200): Promise<void> => {
  for (let i = 0; i < 20; i++) { flush(); await new Promise((r) => setTimeout(r, ms / 20)); }
};

let n = 0;
const started: number[] = [];
const finished: string[] = [];
// v1 fast, v2 SLOW, v3 fast -> v2 lands last in wall-clock order
const delays = [10, 120, 10];
const cell = runWithOwner(null, () =>
  computed(async () => {
    const mine = ++n;
    started.push(mine);
    await new Promise((r) => setTimeout(r, delays[mine - 1] ?? 10));
    finished.push(`v${mine}`);
    return `v${mine}`;
  }, { key: "rtA2" }),
);

const log: string[] = [];
root(() => {
  effect(() => {
    try { log.push(`latest=${String(latest(cell))}`); }
    catch (e) { log.push(`latest threw ${(e as Error).name}`); }
  });
});
flush();
await settle(60);
console.log("warm       :", JSON.stringify(log)); log.length = 0;

refresh(cell); flush();              // starts v2 (120ms)
await new Promise((r) => setTimeout(r, 20)); flush();
refresh(cell); flush();              // starts v3 (10ms) while v2 in flight
console.log("mid-flight :", JSON.stringify(log)); log.length = 0;
await settle(300);
console.log("settled    :", JSON.stringify(log));
console.log("start order:", JSON.stringify(started), "finish order:", JSON.stringify(finished));
console.log("final latest:", (() => { try { return String(latest(cell)); } catch (e) { return `threw ${(e as Error).name}`; } })());
