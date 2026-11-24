import { createServerFn } from "@barqjs/start";

const SECRET = "server-only-secret-must-not-ship";

export const loadUser = createServerFn()
  .validator("unchecked")
  .handler(async ({ data: id }: UserLookup) => ({ id, secret: SECRET }));

interface UserLookup {
  data: unknown;
}
