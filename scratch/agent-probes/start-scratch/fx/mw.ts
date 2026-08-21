import type { Middleware } from "@barqjs/start";
export const requireUser: Middleware = async (next) => next();
export const requireAdmin: Middleware = async (next) => next();
export const chain = [requireUser];
