import { createClientOnlyFn, createIsomorphicFn, createServerOnlyFn } from "@barqjs/start";

export const readKey = createServerOnlyFn(() => "server-only-fn-body-must-not-ship");

export const side = createIsomorphicFn()
  .server(() => "isomorphic-server-half-must-not-ship")
  .client(() => "isomorphic-client-half-reached-the-client");

export const measure = createClientOnlyFn(() => "client-only-fn-body-must-not-reach-the-server");
