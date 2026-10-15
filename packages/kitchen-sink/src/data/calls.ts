/**
 * What a call knows about itself: its method and id in the handler, context
 * sent both ways by one middleware, and a chain the runner refuses because a
 * step returned without calling `next()`.
 */

import { createServerFn } from "@barqjs/start";

import { forgetsNext, traced } from "../trace.ts";

export const describeCall = createServerFn({ method: "GET" })
  .middleware([traced])
  .handler(({ context, method, serverFnMeta }) => ({
    trace: context.trace,
    method,
    id: serverFnMeta.id,
    sentAt: context.sentAt,
  }));

export const neverAnswers = createServerFn()
  .middleware([forgetsNext])
  .handler(() => "unreachable");
