/**
 * Which side this code is running on, where nothing told the bundler.
 *
 * `@barqjs/core` resolves `#env` by export condition, Solid 2.0's arrangement:
 * a browser build gets `env.client.ts` and a `node`, `deno` or `worker` build
 * gets `env.server.ts`, each a literal, so a bundler drops the branch the other
 * side takes. This file is the answer for everything else, and for `bun`, which
 * runs the workspace's sources under a registered DOM in the test suites.
 *
 * The compiler never folds any of them. `isServer` reaches a module as an
 * IMPORTED binding, and `bind.rs` proves constants only for a local `const`
 * with a literal initialiser, so the client and server compiles of one source
 * keep one address table. The fold happens after the compiler, in the bundler.
 */

/**
 * True where there is no DOM.
 *
 * `document` rather than `window`: a Worker has neither, and a server-side DOM
 * implementation registered for rendering (happy-dom's `GlobalRegistrator`)
 * has both — which is correct, because a render against a real DOM is not a
 * string render and the code branching here wants to know which it is.
 */
export const isServer: boolean = typeof document === "undefined";

/** The complement, so a reader never has to spell `!isServer`. */
export const isClient: boolean = !isServer;

/**
 * True under the development entry, which is what the `development` export
 * condition resolves `@barqjs/core` to. A literal here, so a production bundle
 * folds `if (isDev)` away; the development entry exports its own `true` over
 * this one.
 */
export const isDev: boolean = false;
