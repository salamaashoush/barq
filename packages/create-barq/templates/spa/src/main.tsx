/**
 * The client boot. There is no server render, so this RENDERS rather than
 * hydrates — `startClient()` from `@barqjs/router/client` is the hydrating
 * twin, and it belongs to an application that server-renders its pages.
 *
 * `await router.start()` before the first render: the chain has to be decided
 * before anything reads it, or the first frame renders a page nobody matched.
 */

import { render } from "@barqjs/core";
import { RouterProvider, browserHistory, createRouter } from "@barqjs/router";

import { routeTree } from "./routeTree.gen.ts";

const router = createRouter({ routeTree, history: browserHistory() });
await router.start();

const root = document.getElementById("app");
if (root === null) throw new Error("no #app in index.html");

render(() => <RouterProvider state={router} />, root);
