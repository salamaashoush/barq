import { getTraceContext } from "@barqjs/core";

export default async function loadOrders(): Promise<unknown> {
  const trace = getTraceContext();
  const response = await fetch("https://orders.example.com/api", {
    headers: trace === undefined ? {} : { traceparent: trace.entries.traceparent },
  });
  return response.json();
}
