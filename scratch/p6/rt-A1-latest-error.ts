/**
 * RED-A1: what does `latest(cell)` do when a REFRESH REJECTS?
 * The design says `staleReloadMode: background` is `latest(cell)` and needs no
 * state machine. TanStack's background reload keeps the stale value and puts
 * the error on `match.error` / the error boundary. What does barq do?
 */
import { computed, effect, flush, latest, refresh, root, runWithOwner, isPending } from "@barqjs/core";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) { flush(); await new Promise((r) => setTimeout(r, 8)); }
};

let n = 0;
const cell = runWithOwner(null, () =>
  computed(async () => {
    const mine = ++n;
    await new Promise((r) => setTimeout(r, 20));
    if (mine === 2) throw new Error("refresh blew up");
    return `v${mine}`;
  }, { key: "rtA1" }),
);

const log: string[] = [];
root(() => {
  effect(() => {
    try { log.push(`latest=${String(latest(cell))}`); }
    catch (e) { log.push(`latest threw ${(e as Error).name}: ${(e as Error).message}`); }
  });
  effect(() => {
    try { log.push(`plain=${String(cell())}`); }
    catch (e) { log.push(`plain threw ${(e as Error).name}: ${(e as Error).message}`); }
  });
  effect(() => {
    try { log.push(`isPending=${String(isPending(() => cell()))}`); }
    catch (e) { log.push(`isPending threw ${(e as Error).name}`); }
  });
});

flush();
console.log("cold        :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("warm        :", JSON.stringify(log)); log.length = 0;
refresh(cell); flush();
console.log("refreshing  :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("AFTER REJECT:", JSON.stringify(log)); log.length = 0;
// and a THIRD refresh after the rejection - does it recover?
refresh(cell); flush();
console.log("refresh#3   :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("after #3    :", JSON.stringify(log)); log.length = 0;
console.log("invocations :", n);
