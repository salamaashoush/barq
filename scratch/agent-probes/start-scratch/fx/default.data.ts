import { createServerFn } from "@barqjs/start";
import { SECRET, store } from "./db.ts";
export default createServerFn().validator("unchecked").handler(async () => store.concat(SECRET));
