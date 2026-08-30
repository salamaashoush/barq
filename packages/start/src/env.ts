/**
 * Functions whose body belongs to ONE side, resolved by the compiler.
 *
 * A codebase with a server and a browser in it has three shapes that keep
 * recurring: something the server does and the browser does differently,
 * something only the server may do, and something only the browser can. Written
 * by hand each of them is a `typeof window === "undefined"` branch, and every
 * one of those ships BOTH bodies to both bundles — the server's database call
 * sits in the browser's JavaScript, unreachable and readable.
 *
 * The compiler replaces these calls outright, so the half that does not belong
 * is absent by construction rather than unreachable. What is left here is the
 * UNCOMPILED path: a bun test, a script run with no plugin, a package's own
 * suite. It answers as a server would, because that is the only environment
 * anything uncompiled runs in.
 *
 * ITS OWN MODULE, and nothing here imports anything. A client build that keeps
 * the import must not reach the package index, which re-exports `context.ts`
 * and `node:async_hooks` with it — the leak `middleware.ts` records at length.
 */

export type IsomorphicFn<Args extends readonly unknown[] = [], Out = undefined> = (
  ...args: Args
) => Out;

export interface IsomorphicBuilder<
  Args extends readonly unknown[] = [],
  Out = undefined,
> extends IsomorphicFn<Args, Out> {
  server<A extends readonly unknown[], R>(fn: (...args: A) => R): IsomorphicBuilder<A, R>;
  client<A extends readonly unknown[], R>(fn: (...args: A) => R): IsomorphicBuilder<A, R>;
}

/**
 * One name, two bodies, one of which survives the compile.
 *
 * `createIsomorphicFn().server(readFile).client(fetchIt)` is `readFile` in the
 * server bundle and `fetchIt` in the client one. A half that is not declared
 * becomes a no-op rather than a throw: an isomorphic function is one an author
 * expects to call from anywhere, and refusing where they did not write a body
 * would make every call site test the environment again.
 */
export function createIsomorphicFn(): IsomorphicBuilder {
  return build(() => undefined as never);
}

function build<Args extends readonly unknown[], Out>(
  current: (...args: Args) => Out,
): IsomorphicBuilder<Args, Out> {
  // The SERVER half wins if both are declared, because nothing uncompiled runs
  // anywhere else. Theirs keeps the server implementation for the same reason
  // and says so.
  const chain = Object.assign(current, {
    server: (fn: (...args: never[]) => unknown) => build(fn as never),
    client: (fn: (...args: never[]) => unknown) =>
      // Only when nothing has claimed it: `.server(a).client(b)` uncompiled is
      // `a`, and `.client(b)` alone is `b`.
      claimed ? chain : build(fn as never),
  }) as unknown as IsomorphicBuilder<Args, Out>;
  claimed = true;
  return chain;
}

/**
 * Whether a `.server(...)` has been seen on the chain being built.
 *
 * A module-level flag is safe here for the reason a request-scoped one would
 * not be: a builder chain is one synchronous expression, evaluated at module
 * load, and there is no await anywhere in it for a second chain to interleave
 * through.
 */
let claimed = false;

/**
 * A function the CLIENT bundle does not get a body for.
 *
 * The compiler leaves the body in the server build and replaces the call with a
 * throwing stub in the client one, so reading a secret or opening a database
 * connection cannot reach the browser even as dead code.
 */
export function createServerOnlyFn<Args extends readonly unknown[], Out>(
  fn: (...args: Args) => Out,
): (...args: Args) => Out {
  return fn;
}

/** The mirror: the body reaches the browser and the server gets a throw. */
export function createClientOnlyFn<Args extends readonly unknown[], Out>(
  fn: (...args: Args) => Out,
): (...args: Args) => Out {
  return fn;
}
