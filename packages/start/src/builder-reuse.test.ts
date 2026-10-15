import { expect, test } from "bun:test";

import { type StandardSchema, UncheckedInputError, createServerFn } from "./index.ts";

const text: StandardSchema<unknown, string> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) =>
      typeof value === "string" ? { value } : { issues: [{ message: "expected a string" }] },
  },
};

test("two functions finished from one builder keep their own handlers", async () => {
  const base = createServerFn();
  const first = base.handler(() => "first");
  const second = base.handler(() => "second");

  expect(await second()).toBe("second");
  expect(await first()).toBe("first");
});

test("a validator added for a later function does not open an earlier one", async () => {
  const base = createServerFn();
  const closed = base.handler(() => "closed");
  base.validator("unchecked").handler(({ data }) => data);

  const call = closed as unknown as (options: { data: unknown }) => Promise<unknown>;
  await expect(call({ data: { admin: true } })).rejects.toBeInstanceOf(UncheckedInputError);
});

test("each function validates with the schema it was given", async () => {
  const base = createServerFn();
  const strict = base.validator(text).handler(({ data }) => data);
  base.validator("unchecked").handler(({ data }) => data);

  const call = strict as unknown as (options: { data: unknown }) => Promise<unknown>;
  await expect(call({ data: 42 })).rejects.toThrow("failed validation");
});
