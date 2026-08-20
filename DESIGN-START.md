# barq start — server functions, streaming, and the router

A cross-package program document. The per-package designs stay where they are: `packages/compiler-rs/CODESIGN.md`
is still the compiler↔runtime contract, `packages/core/DESIGN-SSR.md` is still the SSR design. This file records
what is being built on top of them, in what order, and — at least as importantly — **which of its own claims
have already been falsified and must not be revived**.

Written 2026-08-20, after four parallel investigations: an oxc feasibility spike against this crate, an
adversarial review of the first draft of this design, a survey of seven shipping server-function
implementations, and a serialization/streaming survey. Every number below was measured or read from a
primary source; where a claim is inherited rather than verified here, it says so.

---

## 0. The short version

Three findings reorder everything.

1. **barq's streaming does not stream.** `renderToStream` awaits *every* in-flight promise before emitting
   *any* parked boundary. Measured with boundaries resolving at 20/40/900/60/80 ms, all five become visible at
   900 ms. This is a runtime defect in one loop, and fixing it is the highest-value change in the program.
2. **"Prove the client/server split with a better DCE" is the losing strategy**, and the field has the scars to
   prove it. The winning strategy is to *synthesize* the client module rather than prune it, which means the
   DCE pass this design originally called for never needs to be written.
3. **The compiler's role is smaller than the first draft claimed.** Three of four proposed compiler
   differentiators died on contact with the crate. What survives is real but modest, plus one large item
   (§6) that is gated on the router existing.

---

## 1. What died, and why it stays dead

Recorded so it is not relitigated. Each row was killed by evidence, not by preference.

| Claim | Killed by |
|---|---|
| Server-function ids are compile-time addresses `(module, unit, position)` | Addresses are minted only for **dynamic props and slots inside JSX** (`ir/address.rs:140`). Probed directly: a `.ts` module holding `export const getUser = createServerFn().handler(...)` returns `positions: []`. A `.tsx` module whose JSX is static returns `positions: []` too. There is nothing to hang an id on. |
| …and they would be more stable than filename+name | Inverted. `position` is a patch position, so an edit above a call site renumbers everything after it. SolidStart ships this failure mode: `hash(path)-<index>` with the name stripped in production, so appending one function renumbers its siblings and an in-flight client calling `441a1dd0-1` for `listUsers` **invokes `deleteUser`**. Name-derived ids degrade to a clean 404; position-derived ids degrade to executing the wrong function. |
| The compiler can *prove* no server code reaches the client | Module-local reachability is not bundle-level reachability. Bare side-effect imports declare no binding, barrel files, transitive chains, computed `import()`, and `/* @__PURE__ */` are all outside what a single-module pass can see. Survives only as a **report**, never as a proof. |
| Security-grade DCE over `Scoping` is the differentiator | Wrong strategy entirely (§3). Also: it does not exist in the crate. `codegen/prune.rs:22` calls itself *"the only pass that deletes user code"* and is name-based over-approximation gated to `const` + plain binding + literal initialiser — not `SymbolId` reachability. |
| Hydration seeds keyed by address beat the owner-tree counter | Regression. `reserveChildSlot` (`signals.ts:2725`) is **per-owner**; each `For` row is its own owner, so 100 rows produce 100 distinct seeds. An address is per call-*site* and is identical for all 100. |
| Two emits from one parse is cheaper than a double parse | Moot, and the cost argument is forbidden. Vite already calls `transform()` twice per module — `packages/compiler/src/vite.ts:332`: *"`ssr` is per-module, not per-plugin: Vite transforms the same file twice."* And CODESIGN §5.4: *"Compile time is the cheapest resource in this system by roughly 40x and must not be treated as a constraint on the design."* |
| `<form action={fn}>` already gives progressive enhancement | It did not, and the reason it now does is not the reason the claim gave. `ssr.ts:449` said PE *"would need a server-generated endpoint per action, which is a routing feature and not this file's"* — true until server functions existed. `@barqjs/start` mounts each one at `/_barq/fn/<id>`, which exists before the page renders, so **no router is involved**. `formAttr` writes that URL and `method="post"` together. The claim was wrong when made and the blocker it named was removed by P3, not by P5. |

One more, parked rather than dead: **folding `isServer` to a constant** breaks H5's address stability
(`SEMANTICS.md:2978` — `-O0` addresses a superset of `-Ox`) and would make the cross-backend address diff
invalid. It needs a decision (fold only outside JSX, or accept a per-env address space) before it is
attempted.

---

## 2. Streaming — the defect, and what beating the field looks like

### 2.1 The head-of-line barrier

`server.ts` `renderToStream`:

```ts
while (parked.length > 0) {
  const batch = parked.splice(0, parked.length);
  await settle(session);          // Promise.allSettled over EVERY in-flight promise
  for (const record of batch) { …emit <template> + swap… }
}
```

`settle()` (`signals.ts:2957`) loops `Promise.allSettled(waiting)` until nothing is in flight. So no boundary
emits until the slowest one in the session has settled.

```
boundaries settling at 20 / 40 / 900 / 60 / 80 ms

today            every boundary visible at 900 ms
per-settle       20ms · 41ms · 61ms · 81ms · 905ms
```

The first fast boundary is held 880 ms by its slowest sibling. Astro's entire server-islands feature exists to
route around exactly this, and pays a second HTTP round trip for it; barq does not need that trade, because
fixing the loop gets out-of-order delivery without leaving the stream.

### 2.2 A second bug the barrier hides

A resumed boundary that still throws `NotReadyError` sets `markup = ""` and is skipped by
`if (markup === "") continue`. It is **dropped and never retried**. Under the batch barrier this is
near-unreachable; under per-settle flushing it is the common case, so the retry queue is a prerequisite, not
a nicety.

### 2.3 No abort path

`grep -n "cancel\|abort" packages/core/src/server.ts` → nothing. The `ReadableStream` has `start()` and no
`cancel()`, there is no per-boundary or total timeout, and `while (parked.length > 0)` is unbounded because a
resumed boundary may park boundaries of its own.

barq is not an outlier — SvelteKit 2.70.3 has the same shape, and Solid's `renderToStream` exposes no abort or
timeout at all. But the norm is measurably wasteful: on AWS Lambda *"streamed responses are not interrupted or
stopped when the invoking client connection is broken. Customers are billed for the full function duration."*

Two independent wirings are required, not one. React auto-aborts via `destination.on('close')`, and that is
defeated by an intermediate `PassThrough` (measured: `pipe(res)` aborts; `pipe(new PassThrough())` renders
forever). So: `cancel()` on the stream **and** an `AbortController` on the request.

### 2.4 The unhandled-rejection interaction — investigated, does not apply

The survey warned that `settle()`'s `Promise.allSettled(waiting)` is what attaches a rejection handler to every
parked promise, so per-settle flushing would expose late rejections and, in Node, kill the process.

**False for this codebase.** Both registration sites attach a *two-argument* `.then` at the moment the promise
enters `inFlight` — `signals.ts:1697` (`awaited.then(settled, failed)`) and `signals.ts:2884` (the async-iterator
pump). The handler is on `awaited` itself and does not depend on `settle` ever being called. Verified
empirically: an async `computed` that rejects and is never settled produces zero `unhandledRejection` events.

No park-time `.catch()` is needed. Recorded because the reasoning is not obvious from the call site and the
next reader will otherwise re-derive it.

### 2.5 Where barq can beat the closest prior art

Nobody streams general RPC results inside SSR HTML, and the stated reasons are sound for genuinely imperative
calls — an imperative RPC is post-hydration, the server cannot know what the client will call, and an inlined
result inherits the document's cacheability.

None of that applies to a value the server *already started resolving during render*. SvelteKit's own source
comment on that case:

> *If the promise is still pending (e.g. the query was rendered in its loading state during SSR), omit it from
> the payload entirely so that the client fetches it itself — an entry without `v`/`e` would hydrate as
> `undefined`.*

SvelteKit drops the value and refetches. With seroval, **a pending promise is representable in the seed**, so
nothing has to be dropped. That is a real win over the nearest comparable system and it requires no compiler
work.

---

## 3. Server functions — synthesize, never prune

### 3.1 The evidence

Every surveyed system that **synthesizes** the client module from scratch (Next.js, SvelteKit, Waku,
RedwoodSDK) is structurally immune to server-code leakage. Every system that **prunes** (React Router;
SolidStart's function-level path) leaks bare side-effect imports silently. The defect in
`babel-dead-code-elimination`, which React Router uses and which TanStack's pipeline shares the shape of:

```js
for (let specifier of path.get("specifiers")) { … removals++ }
if (removals > removalsBefore && path.node.specifiers.length === 0) path.remove()
```

`import './db'` has zero specifiers, so `removals` never increments, so the guard is false, so the declaration
is never removed. React Router's docs concede the general point — *"tree-shaking alone is insufficient"* — and
their fix is opt-in `.server.ts` naming, where `import './db.server'` hard-errors and `import './db'` ships.

Pedro Cattori, who maintains the pruning implementation, in the repo he built to escape it:

> *"In general, it's a bad idea to rely on optimizations for correctness."*

### 3.2 The structural payoff

If the client output is synthesized from an export list, **the client build never compiles the module at
all** — no harvest, no lowering, no codegen, no IR:

| env | compiler does |
|---|---|
| `server` | compile normally, plus registration |
| `client` | emit a stub module from the export list; never parses past classification |

This is why the CODESIGN §5 amendment is small. `options.rs:113` says *"lowering takes no `Program` and codegen
only splices at the sites harvest recorded"*, and the new pass does not violate it in the emitting path: it
**classifies** a module and may **refuse** it. It does not rewrite non-JSX statements on the way to codegen.

### 3.3 The rule

| module shape | compiler does |
|---|---|
| every export is a server fn | wholesale-replace the client module with synthesized stubs |
| mixes server fns and components | **refuse to compile** — diagnostic with a code frame naming the split |

SvelteKit enforces the same rule keyed on the *filename* (a `.remote.ts` may export nothing else). barq keys on
*content*, so the guarantee costs no file-naming convention. This is CODESIGN §7.1's own method: make the
broken shape unrepresentable rather than prove it safe.

The cost is real and is accepted: **a server function cannot live in a route file next to its component.**

### 3.4 The rest of the surface, each with its source

- **Ids from name**, never position, and never coupled to a secret. Next.js couples them — `serverReferenceHashSalt: encryptionKey` — so rotating the AES key to fix a decryption problem invalidates every action id in the app.
- **Mounting decided by export-ness.** SvelteKit's model: a non-exported server fn gets no id and no endpoint but is callable from siblings. That is a genuine internal-function notion, obtained without reachability analysis. Contrast Next.js, whose own release notes concede: *"Even if a Server Action or utility function is not imported elsewhere in your code, it's still a publicly accessible HTTP endpoint."*
- **Fail-closed input.** SvelteKit's three-state arity discriminator: no schema → *any* wire argument is a 400; opening the channel requires typing a schema or the literal `'unchecked'`. Next.js, Waku, SolidStart, RedwoodSDK and React Router all pass raw deserialized values straight into the handler.
- **CSRF on by default**, Waku's post-CVE shape: POST-only, `origin: 'null'` rejected, and `sec-fetch-site: cross-site` rejected when `Origin` is absent. That last clause is stricter than Next.js, which warns and proceeds on a missing `Origin`.
- **No client→server context channel.** TanStack merges a client-supplied `context` object into the server middleware chain; that is an attacker-controlled object crossing the trust boundary by design.
- **No closure capture.** Removes the entire AES-GCM apparatus and its key-distribution problem. Qwik shows the failure mode: captured scope taken verbatim from the request body with zero integrity.
- **Response shape by URL, not header.** RedwoodSDK emits correct `$ACTION_ID_*` hidden fields and never reads them, so a no-JS submit is a silent 200 no-op.
- **`hasOwnProperty` against a build-time manifest** for any client-supplied name. CVE-2025-55182 was CVSS 10.0: request `constructor`, obtain `Function`, execute.

---

## 4. Serialization

**seroval**, hardened. Only seroval and turbo-stream can carry an incrementally-flushed value, which §2.5
requires. seroval costs 0 client bytes in JS mode (3.8 kB gz for the cross-JSON decoder) and measures 292 µs
encode / 217 µs decode on 200 rows against `JSON.stringify`'s 52 µs.

Configuration is not optional:

- **A custom `Error` plugin, redacting to `name` + `message`.** `Feature.ErrorPrototypeStack` is **not
  sufficient**, contrary to the survey. It suppresses the prototype `stack`; on Bun an `Error` also carries
  *own enumerable* properties, and those ride out through `Object.assign`. Measured on 1.6.2 with the flag set:

  ```
  Object.assign(new Error("db connection failed"),
    {originalLine:3,originalColumn:16,line:3,column:15,sourceURL:"/home/…/err-probe.ts"})
  ```

  An absolute server path in a seed is a disclosure bug, and no flag in the enum (`AggregateError`,
  `ArrowFunction`, `ErrorPrototypeStack`, `ObjectAssign`, `BigIntTypedArray`, `RegExp`, `Temporal`) covers it.
- `Feature.RegExp` **disabled**. seroval escapes `<` at the string level but emits RegExp as a *literal* with unescaped source, so `serialize({p: new RegExp('[</script>]')})` emits a raw `</script>` and breaks out of the script element. There is no consumer-side fix, because seroval's JS output inlines helpers containing `<` as a real operator. Disabling throws before serialization and fails closed; with the `Serializer` class the throw routes to per-key `onError`, so one bad key drops alone. The JSON channel is unaffected. **Report privately upstream; do not file publicly.**
- `Feature.ErrorPrototypeStack` **disabled** — necessary, not sufficient; see above.

**Identity holds across flushes.** `createSeedEncoder()` threads one `refs` map and one `scopeId` through
`crossSerialize` for the whole render, and emits `getCrossReferenceHeader()` once ahead of the first payload,
so a later flush writes `$R[1]` where an earlier one defined it. Without it each flush was self-contained and
an object reachable from two keys settled in different rounds arrived as two objects — `a === b` on the server
and `a !== b` on the client. Pinned by a test that gates the second value so the two are guaranteed to land in
different rounds.

The `scopeId` is per render rather than a constant, because two independent renders embedded in one document
would otherwise index into one `$R` bucket with two ref maps and overwrite each other.

**The wire and the seed take different modes, and that is deliberate.** A seed is inlined in a `<script>` the
browser parses as JS anyway, so JS mode costs nothing and ships no decoder. An RPC response is bytes off the
network, and evaluating those is remote code execution no amount of escaping fixes — so `encodeWire` /
`decodeWire` use seroval's JSON channel and reconstruct through `fromJSON`, which evaluates nothing. Same
disabled features and same `Error` redaction on both, so a value that cannot leave through one cannot leave
through the other.

Context for the choice: every serializer in this space shipped a critical deserialization CVE within nine
months — React Flight 10.0 (RCE), seroval 9.8 and 7.5, turbo-stream 8.1, devalue prototype pollution.
Expressiveness *is* the attack surface. The mitigation is disabling features, not switching vendors.

### 4.1 Script escaping — already correct

`escapeScriptPayload` escapes `<`, `>`, U+2028, U+2029. Escaping `<` unconditionally neutralises `</script`,
`<!--` and `<script` at once. Seven of seven surveyed implementations escape either `<` or `<script`; zero
escape `/`. `neutralizeRawText` (`ssr.ts:268`) is minimal-correct, and `server.test.ts` already asserts
`SWAP_SNIPPET` contains no `<` — an invariant enforced by a test rather than a comment.

Two gaps were identified, and moving to seroval resolved one and **closed off** the other:

1. **No CSP nonce anywhere** — fixed. Every inline script a render emits takes the caller's nonce, and the test asserts over *all* of them, because one bare script forces `script-src 'unsafe-inline'` on the whole document.
2. **`&` is not escaped** — and now cannot be. `escapeScriptPayload` must not run over the seed any more, because the seed is no longer JSON: seroval's JS output inlines helpers that use `<` as a real operator. Measured on a typed-array payload, the whole thing contains exactly **one** bare `<`, and it is the `for (let i = 0; i < length; i++)` of the base64 decoder. A blanket pass corrupts the payload rather than protecting it.

   The guarantee therefore moves into seroval, which was verified to escape `</script>` → `\x3C/script>` and U+2028/9 → ` `/` `. What is lost is `&` → `&`, which matters only under `application/xhtml+xml`, where a raw `&` in a script is a fatal XML error. **Serving a barq page as XHTML is not supported**, and that is now a consequence of the encoder rather than an oversight. `escapeScriptPayload` is kept and exported for callers embedding genuine JSON.

Limits, from shipped defaults rather than invention:

| limit | value | source |
|---|---|---|
| inline seed warn | 128 kB | Next.js `largePageDataBytes: 128 * 1000` |
| per-boundary reject | 5 s | Remix 5000 / React Router 4950 |
| stream abort | per-boundary + 1 s | React Router's documented decoupling rule |
| concurrent boundaries | 6, if Cloudflare is a target | CF caps connections awaiting response headers |
| idle stream | periodic heartbeat bytes | HTTP/1.1 has no PING frame |

---

## 5. What the compiler actually contributes

Stated plainly, because §1 deleted most of the first draft's answer.

| contribution | size |
|---|---|
| **Refusing the mixed-module shape** (§3.3) with a code frame — what makes synthesis sound | small, high value |
| **Synthesizing the client stub** from the export list | small |
| **`SymbolId` recognition** of `createServerFn` instead of name/regex matching — kills TanStack's `\.\s*handler\s*\(` false-positive class | small |
| **The route-action manifest** (§6) | large, gated on the router |

The compiler is a **gate and a manifest generator, not a prover**. That is a smaller role than the first draft
sold, and it is also cheaper: the DCE pass that would have had to be written *and then defended as a security
boundary* does not need to exist.

---

## 6. The one large compiler item

Every surveyed framework documents the same hole instead of fixing it: **RPC calls escape route middleware.**

> *"A page-level authentication check does not extend to the Server Actions defined within it. Always re-verify
> inside the action… the Server Action is a separate entry point."* — Next.js

Qwik, SolidStart and RedwoodSDK all ship versions of the same warning. `@vitejs/plugin-rsc` is the only
implementation closing it: a build-time route→action-id manifest computed across both graphs, where an
unreachable id 404s, a mis-routed action is redispatched through the owning route's middleware, and a
progressive-enhancement form is validated against the current route *before* the action may resolve.

Nobody has shipped this in a mainstream framework. It is the single strongest thing barq could build, it is
exactly what semantic analysis buys, and it presupposes routes — so the router is on the critical path for it,
not a parallel track.

---

## 7. Order

**P0 — streaming, `packages/core`. DONE.** No dependency on any open question.

1. ~~no-op `.catch()` at park time~~ — investigated, not needed (§2.4).
2. **Per-settle flush with a retry queue** (§2.1, §2.2). `settleStep(session)` races the session's in-flight
   promises instead of awaiting all of them; the stream loop attempts every parked record per round and
   requeues the ones still unready. Measured on the two-boundary probe: the 20 ms boundary moved from 301 ms
   to 21 ms. Re-invoking a not-ready Block does **not** re-fetch — the keyed value the session recorded is
   reused, verified by fetch counts.
3. **`cancel()` + `AbortSignal`** (§2.3), both wired, plus a `stopped` promise raced against `settleStep` —
   which is what actually bounds the loop, since `settleStep` alone waits on a promise a caller is free never
   to settle.
4. **Per-boundary deadline** measured from when each record parked (`Continuation.at`), default 5 s, with the
   stream's own backstop at +1 s. A boundary past its deadline is abandoned to the fallback rather than
   requeued.

Gate: `bun test` 990 pass / 0 fail (985 baseline + 5 new), `bun run ci` EXIT=0. The head-of-line test is
gate-shaped rather than clock-shaped — the slow boundary cannot settle until the fast template has been
observed, so a batch barrier deadlocks it. Confirmed to bite by temporarily weakening `settleStep` to
`Promise.all`.

**P0.5 — the package split. DONE.** `@barqjs/server` is its own package: `ssr.ts`, `server.ts`, the entry
(was `server-entry.ts`), the three SSR test files, `DESIGN-SSR.md`, and the `seroval` dependency. `@barqjs/core`
keeps signals, dom, hydration, components, flow, store and actions, and no longer depends on seroval.

The compiler emit moved with it. `<module_source>/server` was **concatenated in codegen**, which made the two
specifiers uncoupleable by construction; it is now a `serverSource` option defaulting to `@barqjs/server`, and
the `SERVER` const is deleted. `build.rs` reads `dom.ts` from `core` and `ssr.ts` from `server`.

`@barqjs/core/internal` carries the 18 names the string backend needs and no application does — the boundary
collectors, the scope operations, the async session. It exists so that moving one package did not make that
surface public permanently, and the file says so.

Evidence the change is scoped: the L5 mode matrix is 195 fixtures × 7 modes, and after the move the `dom-Ox`,
`dom-O0`, `interp` and `dom-hydratable` columns are **byte-identical** across every row while `ssr-Ox`,
`ssr-O0` and `ssr-hydratable` all moved. Gate: `cargo test` 305 pass, core 912 + server 78 = 990 (unchanged
total), `bun run ci` EXIT=0.

**P1 — serialization, `packages/server`. DONE except §2.5.** `serialize.ts` replaces `JSON.stringify` in
`hydrationScriptFor`: seroval JS mode (0 client bytes — the payload *is* the program that rebuilds the value),
`Feature.RegExp` and `Feature.ErrorPrototypeStack` disabled, the `Error` redaction plugin, the 128 kB warn.
CSP nonce threaded through `renderPage`, `renderToStream` and `generateHydrationScript`.

**And `renderToStream` now seeds at all.** It never called `getHydrationData`, so a streamed page transferred
nothing and the client refetched every value the server had just awaited — `renderPage`'s answer (render the
whole page a second time) has no equivalent once the shell is on the wire. Seeds are flushed incrementally
instead: once after the shell, once per round, each flush carrying only the keys the previous ones did not.

**§2.5 is closed.** A read that misses while the stream is open now *waits* instead of refetching. The shell
opens a seed channel before the bundle can run, every flush wakes whatever was waiting on the keys it carried,
and the end of the stream closes the channel and releases the rest to fetch for real. `seedLater()` in
`signals.ts` is the client half; a miss with no channel, or a closed one, refetches exactly as a non-streamed
page always has.

This is the piece SvelteKit declines: its own source comment says a still-pending query is *"omitted from the
payload entirely so that the client fetches it itself."* barq carries it.

Gate: server 84 pass (78 + 6 new), core 912, `bun run ci` EXIT=0.

**P3 — `@barqjs/start` runtime. DONE, and taken BEFORE P2.** The compiler's job here is to emit calls into a
contract — `serverRpc(meta, built)` on the server, `clientRpc(id)` on the client — so the contract has to exist
and be tested before anything emits into it. It is also how TanStack is arranged, with `start-client-core` as
the stable surface and the plugin generating wiring into it. Building the pass first would have meant emitting
calls into nothing.

What landed, each row an answer to something the survey found broken somewhere:

| | |
|---|---|
| **Fail-closed input** | A function with no validator refuses *any* argument with a 400. Opening the channel costs a schema or the literal `'unchecked'`. Every surveyed system except SvelteKit passes raw deserialized input into the handler. |
| **`InputError` base** | Both input failures answer 400. The first cut caught only `ValidationError`, so `UncheckedInputError` escaped as a 500 — the test caught it, and one base is why the handler cannot answer one correctly and mis-answer the other. |
| **POST only** | RedwoodSDK shipped GET-invocable server functions (CVE-2026-39371, CVSS 8.1): a plain link became a one-click mutation carrying `SameSite=Lax` cookies. |
| **Origin, then `Sec-Fetch-Site`** | Waku's post-CVE shape. `Origin: null` is refused rather than treated as absent (CVE-2026-27978), and a missing `Origin` with no `Sec-Fetch-Site` is refused — Next.js warns and proceeds. |
| **`Map` registry** | The id comes off the wire, and an object's prototype is reachable through one. CVE-2025-55182 was CVSS 10.0 and was exactly that. Structural rather than a `hasOwnProperty` call someone can forget; pinned by a test over `constructor`, `__proto__`, `toString`, `hasOwnProperty`. |
| **Export-ness mounts** | A non-exported server function is never registered, has no id and no endpoint, and is still callable from its siblings. `mounted()` returns the surface for a build to record and a reviewer to read. |

Then closed in the same pass, because none of them were actually blocked:

| | |
|---|---|
| **The wire** | `encodeWire`/`decodeWire` over seroval's JSON channel, so an argument or a result carries a Date, a Map, a Set, a BigInt or a cycle exactly as a seed does — and reconstructs without evaluating anything. |
| **Middleware** | Per FUNCTION, which is the hole every surveyed framework documents instead of closing. It runs **before** validation: an unauthenticated caller is refused without the server parsing its payload, and a rejection that needed a well-formed payload would be one an attacker skips by sending a malformed one. Rejecting is `throw new Response(...)`. |
| **Request context** | `getRequest()` over `AsyncLocalStorage`, not a module-level variable — that shape hands one caller's session to another under load, which is GHSA-hgv7-v322-mmgr. A test interleaves two requests across an await to say so. |
| **`form` + progressive enhancement** | `/_barq/fn/<id>` takes `FormData` and answers 303 back to a same-origin `Referer`; `/_barq/fn/<id>.data` is the JSON channel. React Router's `.data` suffix, and for its reason: a header decides the shape invisibly and a form cannot set one. RedwoodSDK emits the right hidden fields and never reads them, so its no-JS submit is a silent 200 no-op. |

One divergence found while closing it, worth recording because it was live rather than hypothetical: seroval
encodes `FormData` and decodes it to a **plain object**, so routing an enhanced submission through the value
codec would have handed the handler an object where the no-JS path hands a real `FormData` — the same function
seeing two input types depending on whether JS ran. `FormData` now goes as `FormData` on both paths, which also
keeps files. Pinned by a test that drives both and compares.

Gate: 28 pass, `bun run ci` EXIT=0.

**P2a — recognition, the surface, and the refusal. DONE.** `analysis/server_fn.rs`.

`startSource` (default `@barqjs/start`) names where `createServerFn` is imported from, and resolution is by
**`SymbolId`**: semantic runs, the import specifier resolves to a symbol, and every candidate is walked back
through its call chain to the same one. That is not a stylistic preference over a name match — measured on
four fixtures, it is the difference between right and wrong on two of them. `createServerFn as rpc` resolves
(a name match misses it) and a local `const createServerFn = …` with no import does not (a name match, and
TanStack's `\bcreateServerFn\b|\.\s*handler\s*\(` prescan, matches it).

`serverFns` emits the export surface as a side artefact, on the same terms as `ownership` and `addresses` —
nothing it produces reaches lowering, the passes or codegen. It carries non-server exports too, because a
reviewer reading the mounted surface wants to see what else the module exports as much as what is mounted.

`BARQ012` is the refusal, at **error**: a module exporting server functions *and* anything else cannot have a
client half synthesized, and pruning it instead is the strategy §3 rejects. A warning here would be advice
about a security boundary, ignored by default.

One ordering bug worth recording: `symbol_id` is populated by `SemanticBuilder`, so resolving the import before
building semantic reads an empty cell and finds nothing — the scan silently returned zero exports for every
input until semantic moved first.

**P2b — the client emit. DONE.** `env: "client" | "server"` on `TransformOptions`, orthogonal to `ssr` (which
picks a *backend*, not a half). Under `client`, a module whose exports are all server functions returns before
harvest with a synthesized module and never enters the IR at all:

```
import { clientRpc } from "@barqjs/start";
export const getUser = /* @__PURE__ */ clientRpc("server/users.ts#getUser");
export const listUsers = /* @__PURE__ */ clientRpc("server/users.ts#listUsers");
```

The claim the design rests on, measured on a module carrying `import { db } from './db'`, a bare
`import './telemetry'`, and `const SECRET = process.env.API_KEY`: **none of the five reach the client half.**
Not because a pass removed them — because nothing consulted the module. `import './telemetry'` is the case that
defeats dead-code elimination outright, since it declares no binding and so can never be "unreferenced".

Ids are `<project-relative module>#<export name>`. Name-derived, per §1: SolidStart derives them positionally
and an in-flight client calling for `listUsers` invokes `deleteUser`. Project-relative via a new `root` option,
because RedwoodSDK ships `/src/path.ts#name` verbatim and hands a reader the source-tree layout.

A non-exported server function gets no stub, so it has no id and no endpoint — export-ness decides the surface
in the compiler exactly as it does in the runtime.

Gate: `cargo test` 318, clippy clean, fmt clean, compiler-rs 3483 / 0 fail, plugin 22, `bun run ci` EXIT=0.
`test/diagnostics.test.ts` enforces that every advertised code has an input producing it, so `BARQ012` needed a
row there — a good gate that caught the omission.

**P3 — `@barqjs/start` runtime.** The builder, the handler, the manifest lookup, CSRF, limits.

**P4 — Vite plugin.** Two environments, manifest virtual module, dev SSR middleware.

**P5 — `<form action>` progressive enhancement.** Needs render-time URL minting, so it waits on the router.

**P6 — route-action manifest** (§6). Needs the router.

---

## 7.1 One trap, recorded because it cost an hour

`packages/compiler-rs/test/ssr.test.ts` is classified by `file(1)` as **`data`, not text** — its escaping
corpus contains deliberate invalid UTF-8. `grep` therefore treats it as binary and prints *nothing*, silently,
including for a literal that is plainly there. Two `@barqjs/core/server` imports in it survived four separate
repo-wide greps for exactly that reason, and surfaced only as a module-resolution failure at test time.

Use `grep -a` on anything under `test/`, and do not read an empty `grep` result there as an absence.

## 8. Oracle work this implies, unspecified as yet

L3's invariant is *"`-O0` vs `-Ox` byte-identical rendered DOM."* Client and server emits **deliberately
differ**, so there is no equality to assert across environments and L3 does not extend. The correct invariant is
relational — *the client emit and the server emit agree on the set of function ids and their arities* — and
that is a **new oracle channel**, not an extension of an existing one.

CODESIGN §6's stated blind spot applies with full force here: *"A defect in the specification itself… `-O0` and
`-Ox` will agree on it."* A wrong separation rule is wrong in both emits simultaneously. That is the failure
shape this oracle exists to prevent, now pointed at a security property, and it is the reason §3.3 refuses a
shape rather than analysing one.
