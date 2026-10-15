/**
 * Which half an environment compiles for, by its consumer.
 *
 * By consumer rather than by name, so a second browser environment (a worker,
 * a provider's client) is a browser one. A context with no environment config
 * is a pre-Environment-API caller, and its `ssr` flag answers instead.
 */
export function consumerOf(environment: unknown, options?: { ssr?: boolean }): "client" | "server" {
  const consumer = (environment as { config?: { consumer?: string } } | undefined)?.config
    ?.consumer;
  if (consumer === "client" || consumer === "server") return consumer;
  return options?.ssr === true ? "server" : "client";
}
