/**
 * A static server function: answered while `/about` is prerendered, and read
 * back from the file that wrote in the browser, so the page works on a host
 * that serves files and runs nothing.
 */

import { createServerFn } from "@barqjs/start";
import { staticFunctionMiddleware } from "@barqjs/start/client";

export const buildInfo = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .validator((input: { readonly page: string }) => input)
  .handler(({ data }) => ({ page: data.page, builtAt: new Date() }));
