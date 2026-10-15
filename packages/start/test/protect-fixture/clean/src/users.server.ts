import { createServerFn } from "@barqjs/start";

import { rows } from "./db.server.ts";

export const loadUsers = createServerFn().handler(async () => rows());
