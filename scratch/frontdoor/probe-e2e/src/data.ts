import { createServerFn } from "@barqjs/start";

const SECRET = "server-only-secret-do-not-ship";

export const loadUser = createServerFn()
  .validator("unchecked")
  .handler(async (id: unknown) => ({ id, secret: SECRET.length }));
