import { createServerFn } from "@barqjs/start";

import { audit } from "./audit.ts";

export const readGreeting = createServerFn({ method: "GET" })
  .middleware([audit])
  .validator((input: { readonly name: string }) => input)
  .handler(({ data, context }) => ({
    greeting: `hello ${data.name}`,
    audited: context.audited,
    secret: "get-handler-secret-must-not-ship",
  }));
