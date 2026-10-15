/**
 * One name, two bodies: the server build keeps the first and the browser build
 * the second, so neither ships the other's.
 */

import { createIsomorphicFn } from "@barqjs/start";

export const renderedOn = createIsomorphicFn()
  .server(() => "the server")
  .client(() => "the browser");
