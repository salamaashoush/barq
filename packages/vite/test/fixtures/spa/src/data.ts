import { createServerFn } from "@barqjs/start";

export const loadUser = createServerFn()
  .validator("unchecked")
  .handler(async ({ data: id }: { data: unknown }) => ({ id }));
