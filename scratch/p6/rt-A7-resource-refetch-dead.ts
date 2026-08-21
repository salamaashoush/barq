/** RED-A7: confirm. A SEEDED `resource` cannot be reloaded by any public means. */
import { resource, root, flush, refresh, effect } from "@barqjs/core";
(globalThis as unknown as { __BARQ_DATA__: Record<string, unknown> }).__BARQ_DATA__ = { "r:x": "SEEDED" };
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) { flush(); await new Promise((x) => setTimeout(x, 8)); } };
let n = 0;
const r = root(() => resource(() => "s", async () => { n++; await new Promise((x) => setTimeout(x, 10)); return `FETCH${n}`; }, { key: "r:x" }));
const log: string[] = [];
root(() => { effect(() => { try { log.push(String(r())); } catch (e) { log.push(`threw ${(e as Error).name}`); } }); });
flush(); console.log("hydrated:", JSON.stringify(log), "fetches", n); log.length = 0;

console.log("r has _node?", (r as unknown as { _node?: unknown })._node !== undefined);
refresh(r as unknown as () => unknown); flush(); await settle();
console.log("after refresh(r) :", JSON.stringify(log), "fetches", n); log.length = 0;
await r.refetch(); flush(); await settle();
console.log("after r.refetch():", JSON.stringify(log), "fetches", n, "state", r.state()); log.length = 0;
r.mutate("MUTATED"); flush(); await settle();
console.log("after r.mutate() :", JSON.stringify(log), "value", String(r())); log.length = 0;
await r.refetch(); flush(); await settle();
console.log("refetch after mutate:", JSON.stringify(log), "fetches", n);

// control: a resource that was NOT seeded
let m = 0;
const q = root(() => resource(() => "s", async () => { m++; await new Promise((x) => setTimeout(x, 10)); return `Q${m}`; }, { key: "r:unseeded" }));
root(() => { effect(() => { try { log.push(String(q())); } catch (e) { log.push(`threw ${(e as Error).name}`); } }); });
flush(); await settle(); log.length = 0;
await q.refetch(); flush(); await settle();
console.log("control (unseeded) refetch:", JSON.stringify(log), "fetches", m);
