import { secret } from "./secret.server.ts";

(globalThis as unknown as Record<string, unknown>).leak = () => secret();
