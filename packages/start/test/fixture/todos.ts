import { createServerFn } from "@barqjs/start";

import { SECRET, store } from "./db.ts";

export const addTodo = createServerFn()
  .validator("unchecked")
  .handler(async (title: string) => {
    store.push(`${title}:${SECRET}`);
    return store.length;
  });

export const listTodos = createServerFn().handler(async () => store);

const internal = createServerFn().handler(async () => SECRET);
export const usesInternal = createServerFn().handler(
  async () => (await internal(undefined)).length,
);
