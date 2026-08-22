import { hydrate } from "@barqjs/core";
import { RouterProvider, browserHistory, createRouter } from "@barqjs/router";
import { routes } from "./routes.tsx";
const container = document.getElementById("app")!;
const state = createRouter({ routes, history: browserHistory() });
hydrate((s: never) => RouterProvider(s, { state: () => state } as never) as never, container);
