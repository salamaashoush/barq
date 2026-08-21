/** RED-A6: §1.1 claims `refresh(cell)` re-runs the loader for real because
 * `trySeed` is already false. Check it on a cell whose FIRST value came from
 * the SSR seed — the only shape that matters on the client. */
import { computed, resource, root, runWithOwner, flush, refresh, effect, latest } from "@barqjs/core";
(globalThis as unknown as { __BARQ_DATA__: Record<string, unknown> }).__BARQ_DATA__ = {
  "r:c": "SEEDED-C", "r:r": "SEEDED-R",
};
const settle = async (): Promise<void> => { for (let i = 0; i < 10; i++) { flush(); await new Promise((x) => setTimeout(x, 8)); } };
let cN = 0;
const c = runWithOwner(null, () => computed(async () => { cN++; await new Promise((x) => setTimeout(x, 10)); return `FETCH-C${cN}`; }, { key: "r:c" }));
let rN = 0;
const r = root(() => resource(() => "s", async () => { rN++; await new Promise((x) => setTimeout(x, 10)); return `FETCH-R${rN}`; }, { key: "r:r" }));
const log: string[] = [];
root(() => { effect(() => { try { log.push(`c=${String(c())}`); } catch (e) { log.push(`c threw ${(e as Error).name}`); } });
             effect(() => { try { log.push(`r=${String(r())}`); } catch (e) { log.push(`r threw ${(e as Error).name}`); } }); });
flush(); console.log("hydrated:", JSON.stringify(log), "fetches c/r:", cN, rN); log.length = 0;
refresh(c); void r.refetch(); flush();
console.log("refreshing:", JSON.stringify(log)); log.length = 0;
await settle();
console.log("after refresh:", JSON.stringify(log), "fetches c/r:", cN, rN);
