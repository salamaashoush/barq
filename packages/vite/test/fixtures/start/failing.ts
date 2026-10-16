import { createServerFn } from "@barqjs/start";

export const placeOrder = createServerFn({ method: "POST" })
  .validator("unchecked")
  .handler(async ({ data }: { data: { lines?: string[] } }) => {
    return data.lines!.length;
  });
