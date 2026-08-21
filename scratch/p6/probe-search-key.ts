/**
 * P6-Q1: is a search-dependent loader broken today?
 *
 * `dataFor` keys on `r:<routeId>|<sorted params>` and the loader is HANDED
 * `untrack(search)`. If search is not in the key, then `/posts?page=1` and
 * `/posts?page=2` share one cell, and the second read answers with the first
 * page forever.
 */
import { flush, latest } from "@barqjs/core";
import { createRouter } from "../../packages/router/src/router.ts";
import { memoryHistory } from "../../packages/router/src/history.ts";

let calls = 0;
const seen: string[] = [];

const routes = [
  {
    id: "posts",
    path: "/posts",
    loader: async ({ search }: { search: URLSearchParams }) => {
      calls++;
      const page = search.get("page") ?? "0";
      seen.push(page);
      return `page-${page}`;
    },
  },
];

const state = createRouter({ routes, history: memoryHistory({ initial: ["/posts?page=1"] }) });

const readData = async (): Promise<unknown> => {
  const route = state.chain()[0];
  if (route === undefined) return "<no route>";
  const cell = state.dataFor(route, state.params());
  for (let i = 0; i < 40; i++) {
    try {
      return cell();
    } catch {
      await new Promise((r) => setTimeout(r, 5));
      flush();
    }
  }
  return "<never settled>";
};

console.log("at /posts?page=1 ->", await readData());

await state.navigate("/posts?page=2");
flush();
await new Promise((r) => setTimeout(r, 10));
console.log("location now  ->", state.location().pathname + state.location().search);
console.log("at /posts?page=2 ->", await readData());

console.log("loader invocations:", calls, "  search values the loader saw:", JSON.stringify(seen));
state.dispose();
