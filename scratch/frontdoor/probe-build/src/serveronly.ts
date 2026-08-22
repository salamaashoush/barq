import { createServerFn } from "@barqjs/start";
export const adminOnly = createServerFn().handler(async () => "admin");
