import { createServerFn } from "@barqjs/start";

export const placeOrder = createServerFn({ method: "POST" })
  .validator("unchecked")
  .handler(async ({ data }: OrderCall) => {
    return data.lines!.length;
  });

interface Order {
  lines?: string[];
}

interface OrderCall {
  data: Order;
}
