import { createServerFn } from "@barqjs/start";

export const loadUser = createServerFn().handler(async (id: string) => {
  return { name: `AdaSecretDb ${id}` };
});
