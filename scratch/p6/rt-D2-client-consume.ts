/**
 * RED-D2: the design assumes the client CONSUMES the router's seed. Only
 * `computed` has been probed end-to-end. Does a `resource` under a detached
 * root consume the same seed key without refetching?
 */
import { resource, computed, root, runWithOwner, flush, latest } from "@barqjs/core";

(globalThis as unknown as { __BARQ_DATA__: Record<string, unknown> }).__BARQ_DATA__ = {
  "r:/users/$id|id=7": "Ada-7-FROM-SERVER",
  "r:c|id=7": "C-FROM-SERVER",
};

let resFetches = 0;
const r = root(() =>
  resource(() => "s", async () => { resFetches++; await new Promise((x) => setTimeout(x, 5)); return "CLIENT-FETCH"; },
    { key: "r:/users/$id|id=7" }),
);
let cFetches = 0;
const c = runWithOwner(null, () =>
  computed(async () => { cFetches++; await new Promise((x) => setTimeout(x, 5)); return "CLIENT-FETCH"; }, { key: "r:c|id=7" }),
);

const read = (fn: () => unknown): string => { try { return String(fn()); } catch (e) { return `threw ${(e as Error).name}`; } };
console.log("resource first read (sync):", read(r), "fetches", resFetches);
console.log("computed first read (sync):", read(c), "fetches", cFetches);
flush();
await new Promise((x) => setTimeout(x, 20)); flush();
console.log("resource after tick       :", read(r), "fetches", resFetches);
console.log("computed after tick       :", read(c), "fetches", cFetches);
console.log("resource.state()          :", read(() => r.state()));
console.log("resource.latest()         :", read(() => r.latest()));
