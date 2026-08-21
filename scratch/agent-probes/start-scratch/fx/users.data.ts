import { createServerFn } from "@barqjs/start";
import { store, SECRET } from "./db.ts";
import { requireUser, chain } from "./mw.ts";

// shape 1: inline array literal of imported identifiers
export const loadUsers = createServerFn().middleware([requireUser]).handler(async () => store.concat(SECRET));
// shape 2: spread of an imported array
export const loadPosts = createServerFn().middleware([...chain]).handler(async () => store);
// shape 3: computed / conditional
export const loadAdmin = createServerFn().middleware(chain.filter(Boolean)).handler(async () => SECRET);
// shape 4: no middleware at all
export const loadPublic = createServerFn().handler(async () => 1);
