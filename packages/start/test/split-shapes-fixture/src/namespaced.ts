import * as start from "@barqjs/start";

export const loadNamespaced = start
  .createServerFn()
  .handler(async () => "namespace-handler-body-must-not-ship");
