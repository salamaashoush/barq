/**
 * One middleware, declared once, referenced by BOTH a route and the server
 * functions that route can reach.
 *
 * The build compares those two references with `===`. That is the whole
 * mechanism: `Middleware` is an anonymous closure with no build-visible
 * identity, and every attempt to read `.middleware([…])` out of source dies on
 * the shapes people actually write — `[m]`, `[...chain]`, `chain.filter(Boolean)`.
 * Reference identity resolves all of them and needs no compiler work.
 */

import { type Middleware, type SessionConfig, useSession } from "@barqjs/start";

/**
 * The session, sealed into a cookie with no store behind it.
 *
 * THE PASSWORD IS IN SOURCE HERE AND MUST NOT BE IN YOURS. A real application
 * reads it from the environment, because it is a key: anyone holding it can mint
 * a session for any user. It is inline in the reference application so the demo
 * runs with no setup, and `secure: false` for the same reason — a `Secure`
 * cookie is not sent over the plain `http://localhost` this serves on.
 */
export const sessionConfig: SessionConfig = {
  password: "kitchen-sink-demo-key-not-a-real-secret",
  cookie: { secure: false },
};

/**
 * Refuses before the handler's input is even parsed.
 *
 * `serverRpc` runs middleware BEFORE validation deliberately: an unauthenticated
 * caller should be refused without the server parsing its payload, and a
 * rejection that depended on well-formed input is one an attacker skips by
 * sending malformed input.
 */
export const requireSession: Middleware = async (next) => {
  const session = await useSession<{ user: string }>(sessionConfig);
  // A REAL check, against a real sealed cookie — an unsigned visitor is refused
  // before the handler's input is even parsed. The demo seats a session rather
  // than 401-ing, so the page works on a first visit; the shape an application
  // wants is the `throw` beside it.
  if (session.data.user === undefined) {
    // throw new Response("sign in first", { status: 401 });
    await session.update({ user: "ada" });
  }

  // `next({ context })` is how a middleware hands what it learned down to the
  // handler, which reads it as `({ context })` — theirs is the same shape. It
  // needs no module-level store, which is what makes it safe under concurrency.
  return next({ context: { session: { user: session.data.user ?? "ada" } } });
};
