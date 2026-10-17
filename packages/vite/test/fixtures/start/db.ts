// Stands in for a module that must never reach a browser: a bare side-effect
// import AND a secret, which is the pair dead-code elimination cannot remove.
export const SECRET = "server-only-token";
export const store: string[] = [];
Reflect.set(globalThis, "fixtureDbEvaluated", true);
