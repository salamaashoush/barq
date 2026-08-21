import { createServerFn } from "@barqjs/start";
import { SECRET, store } from "./db.ts";
const loadThings = createServerFn().validator("unchecked").handler(async () => store.concat(SECRET));
export { loadThings };
