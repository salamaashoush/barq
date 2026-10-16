import { createServerOnlyFn } from "@barqjs/start";

import { rows } from "./db.server.ts";
import { loadUsers } from "./users.server.ts";

// The compiler leaves the browser a stub that throws, so the import below it
// names nothing the browser bundle keeps.
const readRows = createServerOnlyFn(() => rows());

Object.assign(globalThis, { call: () => loadUsers(), readRows });
