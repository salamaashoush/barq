import { createServerFn } from "@barqjs/start";

export const loadChecked = createServerFn().handler(
  async () => "satisfies-handler-body-must-not-ship",
) satisfies () => Promise<string>;
