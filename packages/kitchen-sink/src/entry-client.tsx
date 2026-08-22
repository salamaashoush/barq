import { hydrate } from "@barqjs/core";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@barqjs/extra";
import { RouterProvider, browserHistory, createRouter, preloadMatched } from "@barqjs/router";
import { routes } from "virtual:barq-routes";

import { baseStyles } from "./styles";

baseStyles();

const container = document.getElementById("app");
if (container === null) throw new Error("[barq] #app is missing, so there is nowhere to hydrate");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

const state = createRouter({ routes, history: browserHistory() });

// `start()` BEFORE `hydrate()`, then the matched chain's CHUNKS. The walk claims
// one range per route depth, so a chain that is still empty when `hydrate` runs
// claims ranges for nothing; and a route module that has not arrived throws
// `NotReadyError`, which parks the depth's boundary and makes it rebuild — which
// discards exactly the markup hydration exists to keep.
await state.start();
await preloadMatched(state.chain());

hydrate(
  () => (
    <QueryClientProvider client={queryClient}>
      <RouterProvider state={state} />
    </QueryClientProvider>
  ),
  container,
);
