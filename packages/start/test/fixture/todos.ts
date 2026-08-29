import { createServerFn } from "@barqjs/start";

import { SECRET, store } from "./db.ts";

export const addTodo = createServerFn()
  .validator("unchecked")
  .handler(async ({ data: title }: { data: string }) => {
    store.push(`${title}:${SECRET}`);
    return store.length;
  });

export const listTodos = createServerFn().handler(async () => store);

const internal = createServerFn().handler(async () => SECRET);
// A no-argument call is written `internal()`, which is theirs — the bare form
// forced `internal(undefined)` on every one of them.
export const usesInternal = createServerFn().handler(async () => (await internal()).length);
