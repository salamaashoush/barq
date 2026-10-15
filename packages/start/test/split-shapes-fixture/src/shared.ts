import { createServerFn } from "@barqjs/start";

const unchecked = createServerFn().validator("unchecked");

export const loadShared = unchecked.handler(async () => "held-builder-handler-body-must-not-ship");
