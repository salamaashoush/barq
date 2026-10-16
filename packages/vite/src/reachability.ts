/** Which server-function ids each route can reach, from the client module graph. */
export type Reachability = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Which server-function ids each route reaches, walked over the CLIENT module
 * graph.
 *
 * The walk works because a client-compiled route module keeps its import edge:
 * the compiler replaces the server-function module's CONTENTS with `clientRpc`
 * stubs, and the importing route still says
 * `import { getUser } from "./users.ts"`. So the edge from route to
 * server-function module survives, and the stub's ids are literal strings in
 * the module the edge points at.
 *
 * REACHABILITY IS PER-MODULE, NOT PER-FUNCTION, and that is a real limit rather
 * than an oversight. The synthesized stub declares EVERY export of its module
 * regardless of which the importer used, and a bundler's graph exposes imported
 * ids and not imported bindings. So a `.data.ts` holding several actions makes
 * every route touching it "reach" all of them, and `export *` through a barrel
 * is worse. The consequence is over-restriction, which fails safe: the build
 * asks for a chain that may not have been needed, never the other way round.
 */
export function reachabilityFrom(
  entries: ReadonlyMap<string, string>,
  importsOf: (id: string) => readonly string[],
  idsIn: (id: string) => readonly string[],
): Reachability {
  const out = new Map<string, Set<string>>();

  for (const [routeId, moduleId] of entries) {
    const found = new Set<string>();
    const seen = new Set<string>();
    const queue = [moduleId];

    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const id of idsIn(current)) found.add(id);
      for (const next of importsOf(current)) queue.push(next);
    }
    out.set(routeId, found);
  }

  return out;
}

/**
 * Every `clientRpc("…")` id a module's source mentions.
 *
 * The synthesized client half is `export const x = clientRpc("<id>")` and
 * nothing else, so the ids are literals in it. Reading them out of the emitted
 * text rather than re-deriving them is deliberate: the id has to be the same
 * string the server mounted, and deriving it a second time is how the two halves
 * drift — `@barqjs/start`'s manifest makes the same choice for the same reason.
 */
export function idsInStub(code: string): string[] {
  const out: string[] = [];
  // The id is the FIRST argument, and the chain and the method may follow it.
  for (const match of code.matchAll(/clientRpc\(\s*"((?:[^"\\]|\\.)*)"\s*[,)]/g)) {
    const id = match[1];
    if (id !== undefined && id !== "") out.push(id.replaceAll('\\"', '"'));
  }
  return out;
}
