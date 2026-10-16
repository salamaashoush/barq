import { createServerFn } from "@barqjs/start";

const SECRET = "server-only-secret-must-not-ship";

export const loadUser = createServerFn()
  .validator("unchecked")
  .handler(async ({ data: id }: { data: unknown }) => ({ id, secret: SECRET }));
