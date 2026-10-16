import { createServerFn } from "@barqjs/start";

import { width } from "./widget.client.ts";

export const measure = createServerFn().handler(async () => width());
