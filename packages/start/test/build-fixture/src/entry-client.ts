import { loadUser } from "./data.ts";
import { readGreeting } from "./reads.ts";
import { greetStatic } from "./statics.ts";
import { measure, readKey, side } from "./sides.ts";
// Referenced, never called: what a route declaring `middleware: [requireSession]`
// does, and what drags the isomorphic entry into the browser bundle.
import { requireSession } from "./guard.ts";

// CALLED from client code, which is what puts the module in the client graph
// and therefore in the manifest.
(globalThis as unknown as Record<string, unknown>).call = () => loadUser(7);
(globalThis as unknown as Record<string, unknown>).chain = [requireSession];
(globalThis as unknown as Record<string, unknown>).read = () =>
  readGreeting({ data: { name: "salama" } });
(globalThis as unknown as Record<string, unknown>).sides = () => [readKey, side(), measure()];
(globalThis as unknown as Record<string, unknown>).greetStatic = greetStatic;
