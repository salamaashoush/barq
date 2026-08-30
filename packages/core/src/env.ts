/**
 * Which side this code is running on.
 *
 * A runtime constant, deliberately, and NOT something the compiler folds.
 *
 * Folding it was considered and is not being done. The compile-time address
 * table is stable for one build's flags and not across them, because the fold
 * pass turns a constant `SetOnce` into template bytes and bytes have no
 * position to claim. An `isServer` the compiler folded would move the same
 * source's addresses between the client and server builds, and the claim that
 * the two backends compile one source to one address set — so the sets can be
 * diffed — would stop being checkable.
 *
 * Nothing here triggers that. `isServer` is an IMPORTED binding, and `bind.rs`
 * proves constants only for a local `const` with a literal initialiser, so the
 * fold pass never sees a constant to fold. The property holds by construction
 * rather than by a rule someone has to remember.
 *
 * What this costs: a client bundle keeps both branches of `isServer ? a : b`,
 * because `typeof document === "undefined"` is not something a bundler folds
 * either. That is the right trade for user code — a branch is small — and it is
 * NOT how server code is kept out of a browser bundle. That is `@barqjs/start`'s
 * job, and it works by never putting the module in the client graph at all
 * rather than by pruning branches out of one that is (see `BARQ012`).
 *
 * Replacing this with a build-time `define` would reintroduce exactly the H5
 * problem above, because `define` rewrites the source text BEFORE the compiler
 * reads it — the compiler would then see a literal in JSX and fold it. If it is
 * ever wanted, that is the decision to take first.
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
