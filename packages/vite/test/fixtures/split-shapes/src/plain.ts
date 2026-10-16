import { createServerFn } from "@barqjs/start";

export const loadPlain = createServerFn().handler(async () => "plain-handler-body-must-not-ship");
