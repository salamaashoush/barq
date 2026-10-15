import { createServerOnlyFn } from "@barqjs/start";

import { db } from "./db.ts";

export const readRows = createServerOnlyFn(() => db.query("select 1"));
