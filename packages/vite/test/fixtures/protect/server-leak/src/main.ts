import { measure } from "./data.ts";

(globalThis as unknown as Record<string, unknown>).call = () => measure();
