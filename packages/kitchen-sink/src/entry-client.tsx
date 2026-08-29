import { hydrate } from "@barqjs/core";
import { QueryClient } from "@tanstack/query-core";
import { QueryClientProvider } from "@barqjs/extra";
import {
  Document,
  RouterProvider,
  browserHistory,
  createRouter,
  preloadMatched,
  resolveHeadFor,
} from "@barqjs/router";
import { routes } from "virtual:barq-routes";

import { baseStyles } from "./styles";

baseStyles();

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
// The head, BEFORE hydrating. `<HeadContent />` is a keyed list, so a first
// render with nothing in it claims nothing and then replaces every tag the
// server wrote when the promise settles.
const head = await resolveHeadFor(state);

// THE DOCUMENT, not `#app`. The shell is a component like any other, so
// `<HeadContent />` is in the tree and a navigation updates the head through
// ordinary reactivity — there is no second mechanism patching `document.head`
// behind the render, and no ownership attribute for one to key on.
hydrate(
  () => (
    <Document state={state} head={head}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider state={state} />
      </QueryClientProvider>
    </Document>
  ),
  document,
);
