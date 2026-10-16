import { createServerFn } from "@barqjs/start";
import { staticFunctionMiddleware } from "@barqjs/start/client";

export const greetStatic = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .validator((input: { readonly name: string }) => input)
  .handler(({ data }) => ({ greeting: `static hello ${data.name}`, at: new Date(0) }));
