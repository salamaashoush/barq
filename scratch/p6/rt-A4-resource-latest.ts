/**
 * RED-A4: F3's table was measured on `computed` + core `latest()`.
 * §1.2 says the cell becomes a `resource`. `Resource.latest()` is a DIFFERENT
 * function (`async.ts:206-217`): it try/catches and returns `settled`.
 * Does the F3 table still describe it?
 */
import { effect, flush, root, runWithOwner, resource, latest as coreLatest } from "@barqjs/core";

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) { flush(); await new Promise((r) => setTimeout(r, 8)); }
};

let n = 0;
const r = runWithOwner(null, () =>
  resource(() => "s", async () => {
    const mine = ++n;
    await new Promise((res) => setTimeout(res, 20));
    if (mine === 2) throw new Error("reload failed");
    return `v${mine}`;
  }, { key: "rtA4" }),
);

const log: string[] = [];
root(() => {
  effect(() => {
    try { log.push(`r.latest()=${String(r.latest())}`); }
    catch (e) { log.push(`r.latest() threw ${(e as Error).name}`); }
  });
  effect(() => {
    try { log.push(`coreLatest(r)=${String(coreLatest(r))}`); }
    catch (e) { log.push(`coreLatest(r) threw ${(e as Error).name}`); }
  });
  effect(() => {
    try { log.push(`state=${r.state()}`); }
    catch (e) { log.push(`state threw ${(e as Error).name}`); }
  });
});
flush();
console.log("COLD (tracked):", JSON.stringify(log)); log.length = 0;
await settle();
console.log("warm          :", JSON.stringify(log)); log.length = 0;
void r.refetch(); flush();
console.log("refreshing    :", JSON.stringify(log)); log.length = 0;
await settle();
console.log("AFTER REJECT  :", JSON.stringify(log)); log.length = 0;
console.log("invocations:", n);
