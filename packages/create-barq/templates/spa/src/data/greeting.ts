/**
 * A server function: one HTTP endpoint, called like a function.
 *
 * The body never reaches the browser. The compiler replaces this module's
 * exports with client stubs that POST to `/_barq/fn/<id>`, so anything it
 * imports — a database driver, a secret — stays on the server.
 */

import { createServerFn } from "@barqjs/start";

export interface Greeting {
  readonly message: string;
  readonly at: string;
}

export const greeting = createServerFn().handler((): Greeting => ({
  message: "Hello from the server.",
  at: new Date().toISOString(),
}));
