import { createServerFn } from "@barqjs/start";
import { staticFunctionMiddleware } from "@barqjs/start/client";

export const greetStatic = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .validator((input: GreetingInput) => input)
  .handler(({ data }) => ({ greeting: `static hello ${data.name}`, at: new Date(0) }));

interface GreetingInput {
  readonly name: string;
}
