import { addTodo, listTodos } from "./todos.ts";

export async function run(): Promise<unknown> {
  await addTodo("milk");
  return listTodos(undefined);
}
