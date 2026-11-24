import { routeTree } from "./routeTree.gen.ts";

export const config = {
  routeTree,
  defaults: { preload: "intent" as const },
};
