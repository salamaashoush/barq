import { createServerFn } from "@barqjs/start";

export const loadCast = createServerFn().handler(
  async () => "cast-handler-body-must-not-ship",
) as unknown as () => Promise<string>;
