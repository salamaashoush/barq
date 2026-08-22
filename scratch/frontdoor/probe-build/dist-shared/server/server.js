import { Feature, createPlugin, crossSerialize, getCrossReferenceHeader, serialize } from "seroval";
import { AsyncLocalStorage } from "node:async_hooks";
Feature.RegExp | Feature.ErrorPrototypeStack;
createPlugin({
	tag: "barq/redacted-error",
	test: (value) => value instanceof Error,
	parse: { sync: (value, ctx) => ({
		name: ctx.parse(value.name),
		message: ctx.parse(value.message)
	}) },
	serialize: (node, ctx) => `Object.assign(new Error(${ctx.serialize(node.message)}),{name:${ctx.serialize(node.name)}})`,
	deserialize: (node, ctx) => Object.assign(new Error(ctx.deserialize(node.message)), { name: ctx.deserialize(node.name) })
});
//#endregion
//#region ../../../packages/start/dist/src-BS_1QHCR.js
/**
* The request a server function is running for.
*
* Ambient rather than threaded through every signature, because a handler five
* calls deep needs the cookie header and passing a `Request` down to it turns
* every intermediate function into plumbing.
*
* `AsyncLocalStorage` and not a module-level variable: two requests are in
* flight at once on any real server, and a module-level variable would hand one
* request's handler the other's session. That is
* [GHSA-hgv7-v322-mmgr](https://github.com/advisories/GHSA-hgv7-v322-mmgr) in
* SvelteKit — `query.batch()` merging concurrent requests under one context and
* disclosing data across users.
*/
var STORAGE = new AsyncLocalStorage();
/** Run `body` with `request` as the ambient one. */
function withRequest(request, body) {
	return STORAGE.run({ request }, body);
}
/**
* Server functions — the builder, and the two stubs the compiler emits.
*
* A server function is written once and reachable from both sides. The compiler
* decides which side a module is being compiled for and replaces the handler
* with the matching stub: `serverRpc` on the server, where the body runs, and
* `clientRpc` on the client, where it becomes a fetch. That decision is a
* compile-time one and is never taken at runtime, so the body cannot reach a
* client bundle by being unreachable-but-present.
*
* Nothing in this file is safe to call from a browser bundle except
* `clientRpc`. `./server` is where the request handler lives.
*/
var SERVER_FN = Symbol.for("barq.server-fn");
/**
* The caller's input was not acceptable — a 400 rather than a 500, whichever way
* it failed. One base so the handler cannot answer one of them correctly and
* turn the other into a server error, which is exactly what shipped first here.
*/
var InputError = class extends Error {};
var ValidationError = class extends InputError {
	issues;
	constructor(issues) {
		super("server function input failed validation");
		this.name = "ValidationError";
		this.issues = issues;
	}
};
/** Thrown when a call arrives for a function that declared no validator. */
var UncheckedInputError = class extends InputError {
	constructor() {
		super("this server function takes no validated input; declare .validator(schema) to accept arguments, or .validator('unchecked') to accept them unvalidated");
		this.name = "UncheckedInputError";
	}
};
/**
* The three-state discriminator, which is SvelteKit's idea and the best value
* in the survey: no validator means any argument is a 400, and opening the
* channel costs a schema or the literal `'unchecked'`.
*/
async function checkInput(built, raw) {
	if (built.validator === null) {
		if (raw !== void 0) throw new UncheckedInputError();
		return;
	}
	if (built.validator === "unchecked") return raw;
	const result = await built.validator["~standard"].validate(raw);
	if ("issues" in result) throw new ValidationError(result.issues);
	return result.value;
}
/**
* Author a server function. The value this returns is replaced by the compiler
* on both sides, so what it does when compiled by nothing is only the
* uncompiled-development path: it runs the handler in-process.
*/
function createServerFn() {
	const built = {
		validator: null,
		middleware: [],
		handler: () => void 0
	};
	const builder = {
		middleware(chain) {
			built.middleware = chain;
			return builder;
		},
		validator(schema) {
			built.validator = schema;
			return builder;
		},
		handler(fn) {
			built.handler = fn;
			return serverRpc({ id: "" }, built);
		}
	};
	return builder;
}
/**
* The server half. The compiler emits this in a module compiled for the server,
* with the real handler and the id it assigned.
*/
function serverRpc(meta, built) {
	const run = async (input) => built.handler(await checkInput(built, input));
	const call = async (input) => {
		let index = 0;
		const next = async () => {
			const step = built.middleware[index++];
			return step === void 0 ? run(input) : step(next);
		};
		return await next();
	};
	return Object.assign(call, {
		[SERVER_FN]: true,
		meta,
		built
	});
}
/** Whether a value is a server function, by brand rather than by shape. */
function isServerFn(value) {
	return typeof value === "function" && value[SERVER_FN] === true;
}
//#endregion
//#region src/serveronly.ts
var adminOnly = createServerFn().handler(async () => "admin");
//#endregion
//#region ../../../packages/start/dist/server.js
/**
* The request handler: one URL shape, one lookup, and the checks that run
* before a handler body does.
*
* Every default here is the strict one, because the survey found the same four
* failures composing across shipping frameworks — an unvalidated, CSRF-unchecked,
* publicly-mounted endpoint reached by an id enumerable from the client bundle.
* Each is cheap to close and expensive to retrofit.
*/
/**
* id → function, and the ONLY way an id becomes callable.
*
* A `Map` rather than an object, because the id comes off the wire and an
* object's prototype is reachable through one. CVE-2025-55182 was CVSS 10.0 and
* was exactly that: a client-supplied name used as a raw property access, so
* asking for `constructor` yielded `Function` and then arbitrary code. `Map.get`
* has no prototype chain to walk into, so the guard is structural rather than a
* `hasOwnProperty` call someone can later forget.
*/
var REGISTRY = /* @__PURE__ */ new Map();
/**
* Mount a server function. The compiler emits one call per EXPORTED server
* function in a module compiled for the server.
*
* Export-ness is what decides reachability, which is SvelteKit's rule and the
* only genuine notion of an internal server function in the survey: a
* non-exported one is never registered, so it has no id and no endpoint, and is
* still callable from its siblings.
*/
function mount$2(id, fn) {
	if (!isServerFn(fn)) throw new TypeError("mount() takes a server function");
	if (id === "") throw new TypeError("a mounted server function needs an id");
	if (REGISTRY.has(id)) throw new TypeError(`two server functions claim the id ${id}`);
	fn.meta.id = id;
	REGISTRY.set(id, fn);
}
//#endregion
//#region src/data.ts
var loadUser = createServerFn().handler(async (id) => {
	return { name: `AdaSecretDb ${id}` };
});
//#endregion
//#region \0virtual:barq-server-fns
mount$2("src/data.ts#loadUser", loadUser);
//#endregion
//#region ../../../packages/core/dist/index.js
/**
* The L2b ownership trace's attachment point (CODESIGN.md §6). `null` until
* `beginOwnershipTrace()` installs a sink.
*
* why: a `const` holder rather than an `export let`, and `import type` above
* rather than a value import, because Bun inlines a module-scope numeric
* `const` (`REACTIVE_DISPOSED` → `32`) only while a module has neither a value
* import nor a reassigned top-level binding — and a signal accessor's
* `toString()` is observable, since `diagnostic-accessor-coercion.tsx` renders
* it into the DOM and snapshots it. Either of the obvious spellings moves that
* snapshot.
*/
var OWNERSHIP$1 = { sink: null };
var REACTIVE_CHECK$1 = 1;
var REACTIVE_DIRTY$1 = 2;
var REACTIVE_RECOMPUTING_DEPS$1 = 4;
var REACTIVE_IN_HEAP$1 = 8;
var REACTIVE_IN_HEAP_HEIGHT$1 = 16;
var REACTIVE_DISPOSED$1 = 32;
var REACTIVE_UNINITIALIZED$1 = 64;
var STATUS_PENDING$1 = 128;
var STATUS_ERROR$1 = 256;
var REACTIVE_CHILDREN_FORBIDDEN$1 = 512;
var EFFECT_PURE$1 = 0;
var EFFECT_RENDER$1 = 1;
var EFFECT_USER$1 = 2;
/**
* Error thrown when trying to access context outside a reactive root
*/
var NoOwnerError = class extends Error {
	constructor() {
		super("Context can only be accessed under a reactive root.");
		this.name = "NoOwnerError";
	}
};
/**
* §3.0 rule 3's brand and its enforcement, in one value.
*
* The brand is POSITIVE: it means "this value requires a scope". An unbranded
* function is a Cell, or a Block that ignores its scope (an arity-0
* `template()`, C6) — which is simultaneously a legal Cell, which is why rule 2
* lets one call site serve both kinds. Kind travels with the value (rule 4),
* so a forwarded Block is still branded and an arity guess is never consulted.
*
* C3.8 is a property of the VALUE, not of a call site. A marked-in-place `fn`
* makes the brand readable but leaves "invoked without a scope" enforceable only
* where someone remembered to ask, and six of the seven Cell slots on the
* primitive surface did not — so a Block reaching one ran with `s === undefined`
* and every ambient read inside it resolved against `CURRENT`, which is the
* Provider bug at the one place §3.0 says nobody would look. The wrapper is one
* closure per DEFINITION site and none per activation.
*
* It lives here rather than in `props.ts` for the reason `scope.ts` states at
* the top of the file: this module may acquire no VALUE import, because Bun
* stops inlining a module-scope numeric `const` once it has one, and a signal
* accessor's own `toString()` is snapshotted by a fixture.
*/
var BLOCK$1 = Symbol.for("barq.block");
/**
* C1/O4.5: the scope a Block is HANDED is the scope its body builds under.
*
* The guard alone made the argument decide only for the primitives that take it
* explicitly — `insert`, `bindEffect`, the four flow primitives. Everything in
* the same body that reads the AMBIENT owner instead — `getContext`,
* `onCleanup`, `effect`, a `signal`'s owner — followed `CURRENT`, so one
* component handed A while B was ambient split its ownership across both: its
* hole under A, its cleanup under B. Nothing in the calling convention
* established the ambient, because a component call is a plain call.
*
* Establishing it here costs one `try`/`finally` per activation and makes the
* argument genuinely decide for every ambient-reading API at once. `null` is
* left alone for the reason `dom.ts`'s `ownedBy` states: it names no owner, so
* there is nothing for the argument to win, and forcing it would RELOCATE
* ownership through the orphan list rather than decide it.
*/
function block(fn) {
	const guarded = function(scope) {
		if (scope === void 0) throw new ScopeMissingError$1(blockOrigin(fn));
		const body = fn;
		if (scope === null) return body.apply(this, arguments);
		const prevOwner = currentOwner$1;
		const prevHost = currentHost$1;
		currentOwner$1 = scope;
		currentHost$1 = null;
		try {
			return body.apply(this, arguments);
		} finally {
			currentOwner$1 = prevOwner;
			currentHost$1 = prevHost;
		}
	};
	return brand(guarded);
}
/** The brand without the entry guard, for the one value that legally ignores its scope. */
function brand(fn) {
	fn[BLOCK$1] = true;
	return fn;
}
/** Built only on the throw: naming the Block costs nothing until one is wrong. */
function blockOrigin(fn) {
	const name = fn.name;
	return name !== void 0 && name !== "" ? `Block ${name}` : "a Block";
}
/** Whether `value` is a Block that declared it needs the scope it is handed. */
function isBlock$1(value) {
	return typeof value === "function" && Boolean(value[BLOCK$1]);
}
/**
* §3.0 rule 3. A construct invoked without a scope throws and NEVER falls back
* to the ambient owner: that fallback is the Provider bug reintroduced at the
* one place nobody would look for it.
*
* `null` is a scope VALUE, not a missing one — it is what the compiler emits
* for a module-level root (`const _s$ = null`). Only `undefined` is missing.
*/
var ScopeMissingError$1 = class extends Error {
	origin;
	constructor(origin) {
		super(`${origin} was invoked without a scope. A Block takes the scope it must run under as its first argument; calling it with none is a mistimed construction, and falling back to the ambient owner would put the subtree under whatever happened to be current instead.`);
		this.origin = origin;
		this.name = "ScopeMissingError";
	}
};
/**
* Error thrown when context is not found and no default value provided
*/
var ContextNotFoundError = class extends Error {
	constructor() {
		super("Context must either be created with a default value or a value must be provided before accessing it.");
		this.name = "ContextNotFoundError";
	}
};
/**
* Thrown when reading an async value that has not resolved yet.
* Caught by Loading boundaries and by isPending()/latest().
*/
var NotReadyError$1 = class extends Error {
	/**
	* The node whose read threw, when there is one.
	*
	* `latest` and `isPending` both need it: their rule is not "was it pending"
	* but "was it pending AND has it never held a value", and only the source
	* knows the second half.
	*/
	source;
	constructor(source) {
		super("Async value is not ready yet.");
		this.name = "NotReadyError";
		this.source = source;
	}
};
var diagnosticSequence = 0;
var diagnosticListeners = /* @__PURE__ */ new Set();
/** Mirrors `diagnosticListeners.size !== 0` as a single load for hot paths */
var diagnosticsOn = false;
/**
* The same single load `emitDiagnostic` short-circuits on, for a caller whose
* CHECK is the expensive part rather than the message. `flow.ts`'s C7 counter
* is the one such caller: building the argument costs a WeakMap probe per
* activation and nobody is listening on the hot path.
*/
function diagnosticsEnabled() {
	return diagnosticsOn;
}
function emitDiagnostic(code, severity, message, nodeName, data) {
	if (!diagnosticsOn) return;
	const event = {
		sequence: diagnosticSequence++,
		code,
		severity,
		message,
		nodeName,
		data
	};
	for (const listener of diagnosticListeners) listener(event);
}
/** Context key for Loading boundaries (used by components) */
var LOADING_BOUNDARY$1 = Symbol("loading-boundary");
/** Context key for error boundaries; value is (err: unknown) => void */
var ERROR_BOUNDARY$1 = Symbol("error-boundary");
/** Sentinel for "no occupied height"; any real height compares lower */
var HEAP_EMPTY_MIN$1 = 2147483647;
function createHeap$1() {
	return {
		_heap: new Array(256).fill(void 0),
		_min: HEAP_EMPTY_MIN$1,
		_max: 0,
		_count: 0
	};
}
var renderHeap$1 = createHeap$1();
var userHeap$1 = createHeap$1();
function heapFor$1(node) {
	return node._kind === EFFECT_USER$1 ? userHeap$1 : renderHeap$1;
}
/** Actually insert node into heap at its height level */
function actualInsertIntoHeap$1(node, heap) {
	const height = node._height;
	if (height >= heap._heap.length) heap._heap.length = height + 100;
	const heapAtHeight = heap._heap[height];
	if (heapAtHeight === void 0) {
		heap._heap[height] = node;
		node._prevHeap = node;
		node._nextHeap = void 0;
	} else {
		const tail = heapAtHeight._prevHeap;
		tail._nextHeap = node;
		node._prevHeap = tail;
		node._nextHeap = void 0;
		heapAtHeight._prevHeap = node;
	}
	if (height > heap._max) heap._max = height;
	if (height < heap._min) heap._min = height;
	heap._count++;
}
/** Insert node into heap for recomputation */
function insertIntoHeap$1(node, heap) {
	const flags = node._flags;
	if (flags & 12) return;
	node._flags = flags | REACTIVE_IN_HEAP$1;
	if (!(flags & REACTIVE_IN_HEAP_HEIGHT$1)) actualInsertIntoHeap$1(node, heap);
}
/** Insert node into heap for height adjustment only */
function insertIntoHeapHeight$1(node, heap) {
	const flags = node._flags;
	if (flags & 28) return;
	node._flags = flags | REACTIVE_IN_HEAP_HEIGHT$1;
	actualInsertIntoHeap$1(node, heap);
}
/** Remove node from heap */
function deleteFromHeap$1(node, heap) {
	const flags = node._flags;
	if (!(flags & 24)) return;
	node._flags = flags & -25;
	const height = node._height;
	const heapHead = heap._heap[height];
	if (!heapHead) return;
	if (node._prevHeap === node) heap._heap[height] = void 0;
	else {
		const next = node._nextHeap;
		const end = next ?? heapHead;
		if (node === heapHead) heap._heap[height] = next;
		else node._prevHeap._nextHeap = next;
		end._prevHeap = node._prevHeap;
	}
	node._prevHeap = node;
	node._nextHeap = void 0;
	heap._count--;
}
/** Adjust height of a node based on its dependencies */
function adjustHeight$1(node, heap) {
	deleteFromHeap$1(node, heap);
	let newHeight = node._height;
	for (let d = node._deps; d !== null; d = d._nextDep) {
		const dep = d._dep;
		if (dep._fn !== void 0 && dep._height >= newHeight) newHeight = dep._height + 1;
	}
	if (node._height !== newHeight) {
		node._height = newHeight;
		for (let s = node._subs; s !== null; s = s._nextSub) {
			const sub = s._sub;
			if (sub._kind !== EFFECT_PURE$1) insertIntoHeapHeight$1(sub, heapFor$1(sub));
		}
	}
}
/**
* Run heap - process all scheduled effects in topological (height) order.
* Re-scans until fully drained: effects may write signals that re-insert
* nodes at lower heights (feedback writes).
*/
function runHeap$1(heap) {
	while (heap._count > 0) {
		const end = heap._max;
		for (let height = heap._min; height <= end; height++) {
			let node = heap._heap[height];
			while (node !== void 0) {
				if (node._flags & REACTIVE_IN_HEAP$1) {
					updateIfNecessary$1(node);
					deleteFromHeap$1(node, heap);
				} else adjustHeight$1(node, heap);
				node = heap._heap[height];
			}
		}
	}
	heap._min = HEAP_EMPTY_MIN$1;
	heap._max = 0;
}
var currentObserver$1 = null;
var tracking$1 = false;
var batchDepth = 0;
var scheduled$1 = false;
var latestDepth = 0;
var clock$1 = 0;
var defaultContext$1 = {};
/**
* The ambient owner. O4.5: this is an OBSERVATION channel — user-written
* `onCleanup()` and `Ctx.use()` find their owner through it — and never a
* decision channel. A primitive with a `Scope` argument in scope that reads
* this instead is the defect the redesign exists to remove.
*/
var currentOwner$1 = null;
/**
* The computation whose scope `currentOwner` stands for, while that scope is
* still unallocated. Q6: a computation that owns nothing never pays for a
* Scope, so the owner is materialised on the first thing that needs one.
*/
var currentHost$1 = null;
var scopesAllocated$1 = 0;
var effectsAllocated$1 = 0;
function makeScope$1(parent) {
	scopesAllocated$1++;
	return {
		parent,
		ctx: parent !== null ? parent.ctx : defaultContext$1,
		cleanups: null,
		kids: null,
		catcher: parent !== null ? parent.catcher : null,
		gen: 0,
		dead: false,
		origin: void 0,
		dispose: null,
		_prev: null,
		_prevHost: null,
		_open: false,
		_abort: null,
		_range: null,
		_forked: false
	};
}
/** The scope a computation owns its children through, allocated on demand. */
function hostScope$1(node) {
	let scope = node._scope;
	if (scope === null) {
		scope = makeScope$1(node._owner);
		scope.dispose = () => disposeNode$1(node);
		node._scope = scope;
	}
	return scope;
}
function getCurrentOwner$1() {
	if (currentOwner$1 === null && currentHost$1 !== null) currentOwner$1 = hostScope$1(currentHost$1);
	return currentOwner$1;
}
/**
* Get the current owner context.
* Useful for capturing owner to restore later in async callbacks.
*/
function getOwner$1() {
	return getCurrentOwner$1();
}
/**
* Run a function with a specific owner context.
* Errors propagate to the caller; the previous owner is always restored.
*/
function runWithOwner(owner, fn) {
	if (owner?.dead) emitDiagnostic("RUN_WITH_DISPOSED_OWNER", "warning", "runWithOwner called with a disposed owner; computations created inside will never be cleaned up by it.");
	const prevOwner = currentOwner$1;
	const prevHost = currentHost$1;
	currentOwner$1 = owner;
	currentHost$1 = null;
	try {
		return fn();
	} finally {
		currentOwner$1 = prevOwner;
		currentHost$1 = prevHost;
	}
}
/**
* O2/§3.0: open a fresh child of `parent`, make it current, and hand it back.
* `exit` is the other half and is required on both paths (O4.1).
*
* `parent` has no default, deliberately. O4.5: a primitive that reads the
* ambient owner where a `Scope` argument is in scope is the defect shape this
* redesign removes, and a defaulted parameter is that read with a nicer name.
*/
function enter(parent, kind = "scope") {
	if (parent !== null && parent.dead) emitDiagnostic("RUN_WITH_DISPOSED_OWNER", "warning", "enter() was called on a disposed scope; the child and everything created under it will never be cleaned up by it.");
	const scope = makeScope$1(parent);
	scope.dispose = () => disposeScope$1(scope);
	if (parent !== null) (parent.kids ??= []).push(scope);
	scope._prev = currentOwner$1;
	scope._prevHost = currentHost$1;
	scope._open = true;
	currentOwner$1 = scope;
	currentHost$1 = null;
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.enter(scope, parent, kind, parent !== null);
	return scope;
}
/** The scope a construct was handed, or a throw naming where it was missing. */
function requireScope$1(scope, origin) {
	if (scope === void 0) throw new ScopeMissingError$1(origin);
	return scope;
}
/**
* §3.0 rule 2 / §3.13: a CELL-slot read. A Cell is called with no scope and
* yields its value; a Block reaching here would be called with `s === undefined`
* and rule 3 says that throws rather than silently building under `CURRENT` or
* silently yielding `undefined`. The brand makes it a property test, so the
* throw names both ends instead of waiting for a downstream `TypeError`.
*/
function readSlot(value, origin) {
	if (typeof value !== "function") return value;
	if (isBlock$1(value)) throw new ScopeMissingError$1(`${origin} (a Block reached a Cell slot)`);
	const read = value();
	if (isBlock$1(read)) throw new ScopeMissingError$1(`${origin} (a Cell yielded a Block)`);
	return read;
}
/**
* O2/O4.5: run `fn` with the scope a construct was GIVEN as `CURRENT`, so every
* ambient read below it resolves to that argument rather than to whatever
* happened to be current at the call site. Handing a construct scope A while B
* is ambient must put its subtree under A; without this the argument is
* decoration and `pin` has nothing to override.
*/
function underScope$1(scope, origin, fn) {
	const given = requireScope$1(scope, origin);
	const prevOwner = currentOwner$1;
	const prevHost = currentHost$1;
	currentOwner$1 = given;
	currentHost$1 = null;
	try {
		return fn(given);
	} finally {
		currentOwner$1 = prevOwner;
		currentHost$1 = prevHost;
	}
}
/** Restore `CURRENT` to what it was before `scope`'s `enter` (O4.1, O4.3). */
function exit$1(scope) {
	if (!scope._open) return;
	scope._open = false;
	currentOwner$1 = scope._prev;
	currentHost$1 = scope._prevHost;
	scope._prev = null;
	scope._prevHost = null;
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.exit(scope);
}
/**
* O3.2: kids in reverse creation order, depth-first.
*
* The array is detached from the scope BEFORE the walk, which is what tells a
* child disposing inside it not to splice itself out of a list that is being
* discarded whole. A module-global depth counter said the same thing for the
* wrong scope: any disposal happening anywhere while some unrelated tree was
* unwinding skipped its splice too, and a long-lived parent kept every dead
* child forever — the leak the guard exists to prevent, at one remove.
*/
function unwindKids$1(scope) {
	const kids = scope.kids;
	if (kids === null) return;
	scope.kids = null;
	unwindKidsInner$1(kids);
	kids.length = 0;
}
function unwindKidsInner$1(kids) {
	for (let i = kids.length - 1; i >= 0; i--) {
		const kid = kids[i];
		if (kid.kids !== void 0) disposeScope$1(kid);
		else disposeNode$1(kid);
	}
}
/** O3.3: cleanups LIFO, after every kid is gone. */
function unwindCleanups$1(scope) {
	const cleanups = scope.cleanups;
	if (cleanups === null) return;
	for (let i = cleanups.length - 1; i >= 0; i--) runUntracked$1(cleanups[i], scope.catcher, scope);
	cleanups.length = 0;
}
/**
* O3: total and ordered, and idempotent. Mark dead and bump `gen` first, so a
* cleanup that schedules work observes a dead scope; then kids, then cleanups,
* then the abort signal, then the range.
*/
function disposeScope$1(scope) {
	if (scope.dead) return;
	scope.dead = true;
	scope.gen++;
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.dispose(scope);
	const parent = scope.parent;
	if (parent !== null && parent.kids !== null) {
		const at = parent.kids.indexOf(scope);
		if (at !== -1) parent.kids.splice(at, 1);
	}
	unwindKids$1(scope);
	unwindCleanups$1(scope);
	const abort = scope._abort;
	if (abort !== null) {
		scope._abort = null;
		abort.abort();
	}
	const range = scope._range;
	if (range !== null) {
		scope._range = null;
		range();
	}
}
/** O3.5: the range removal this scope owns; disposal runs it last. */
function ownRange$1(scope, remove) {
	scope._range = remove;
}
/**
* X6/§3.3: share the parent record by reference until the first provide, then
* `Object.create` once. A scope that provides nothing costs nothing, and a
* provider costs one prototype link regardless of how many keys are in scope.
*/
function provideOn$1(scope, key, value) {
	if (isBlock$1(value)) throw new ScopeMissingError$1("provide (a Block reached a Cell slot)");
	if (!scope._forked) {
		scope.ctx = Object.create(scope.ctx);
		scope._forked = true;
	}
	scope.ctx[key] = value;
}
/** Returned by `lookupContext` for a key no scope on the chain binds. */
var CONTEXT_MISS$1 = Symbol("context-miss");
/**
* X3: resolution is a walk of the scope chain, performed when the read
* happens. Only a scope's OWN record counts, so a provider installed above a
* consumer that already exists is still found — which is the whole point of
* X3 and the reason `ErrorBoundary`'s build-then-install ordering is harmless.
* Resolving through `ctx`'s prototype chain instead captures the record at
* scope-creation time, which X3 forbids in as many words.
*/
function lookupContext$1(scope, key) {
	for (let at = scope; at !== null; at = at.parent) if (at._forked && Object.hasOwn(at.ctx, key)) return at.ctx[key];
	return CONTEXT_MISS$1;
}
/** The same walk from a computation, which may not have materialised a scope. */
function lookupNodeContext$1(node, key) {
	return lookupContext$1(node._scope !== null ? node._scope : node._owner, key);
}
/**
* Effects and cleanups created while `CURRENT` was null, in creation order.
*
* O5 says `render(block, container)` opens the root scope and invokes the
* block under it, and once M3's calling convention lands that is the whole
* story. Until it does, the compiler emits `render(Tree({}), host)` — the
* subtree is an ARGUMENT, so it is built before `render` is entered and there
* is no owner in existence at the moment its effects are created. Dropping
* them on the floor is what makes every barq mount leak its reactive graph.
*
* So they are held here instead, and the next root scope claims them. Pure
* computeds are not collected: nothing schedules them, and disposing the
* effects that read them unlinks them anyway, so a list would only retain
* garbage.
*
* **The window is one turn.** A mount claims what the same synchronous turn
* built, and `flushSync` drops whatever is still unclaimed when the turn's work
* settles. Holding them for the lifetime of the process instead made every
* ownerless effect immortal — 217 bytes retained per effect, measured, and a
* 14–30% slowdown on the DOM rows — and let an unrelated later `render` adopt
* and destroy work it had nothing to do with.
*
* **This list dies with M8, not M3.** M3 made the COMPILED path build under the
* root, but the un-compiled consumers (`packages/extra`, `packages/kitchen-sink`)
* still build ownerless and their `onCleanup` has nowhere else to go. Once §8
* puts them on the barq compiler, `adoptOrphans` has nothing to find and the
* three functions below go with it. Pinned in extra/src/m8-convention.test.ts.
*/
var orphans$1 = [];
/** Move everything built with no owner onto `scope`, oldest first. */
function adoptOrphans$1(scope) {
	if (orphans$1.length === 0) return;
	const kids = scope.kids ??= [];
	for (let i = 0; i < orphans$1.length; i++) {
		const kid = orphans$1[i];
		if (kid.kids !== void 0) kid.parent = scope;
		else {
			kid._owner = scope;
			const own = kid._scope;
			if (own !== null) own.parent = scope;
		}
		kids.push(kid);
	}
	release$1(orphans$1);
}
/** Cleanups registered with no owner; adopted by the same root scope. */
var orphanCleanups$1 = [];
function adoptOrphanCleanups$1(scope) {
	if (orphanCleanups$1.length === 0) return;
	const cleanups = scope.cleanups ??= [];
	for (let i = 0; i < orphanCleanups$1.length; i++) cleanups.push(orphanCleanups$1[i]);
	release$1(orphanCleanups$1);
}
/**
* `list.length = 0` publishes a shorter length and leaves the old values in
* the backing vector, where they go on holding everything they reference. On a
* module-level list that is a permanent leak — 253 bytes per ownerless effect,
* measured, with the list reading as empty the whole time — so the slots are
* released before the length is.
*/
function release$1(list) {
	for (let i = 0; i < list.length; i++) list[i] = void 0;
	list.length = 0;
}
/** Close the claim window: unclaimed at flush time is unclaimed for good. */
function dropOrphans$1() {
	if (orphans$1.length !== 0) release$1(orphans$1);
	if (orphanCleanups$1.length !== 0) release$1(orphanCleanups$1);
}
/**
* O5: open the root scope a mount is owned by. It is a catcher by
* construction, so E1's "the nearest catching scope always exists" is true
* without a walk.
*
* `claimOrphans` is the ALREADY-BUILT form's bridge and nothing else. The
* orphan list bounds the claim in TIME, not by PROVENANCE: a module that
* initialises library state and mounts in the same synchronous turn puts that
* library's ownerless effects on the same list, and a root that claims it
* adopts — and later destroys — work it had nothing to do with. That trade is
* only worth making when the argument was built before `render` was entered
* and there is no other owner for it. When `render` is handed a Block the
* subtree builds UNDER this scope, so there is nothing to claim and claiming
* anyway is pure relocation.
*/
function enterRoot$1(claimOrphans = true) {
	const scope = makeScope$1(null);
	scope.dispose = () => disposeScope$1(scope);
	scope.catcher = { handle: rootCatch$1 };
	scope._prev = currentOwner$1;
	scope._prevHost = currentHost$1;
	scope._open = true;
	currentOwner$1 = scope;
	currentHost$1 = null;
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.enter(scope, null, "root", false);
	if (claimOrphans) {
		adoptOrphans$1(scope);
		adoptOrphanCleanups$1(scope);
	}
	return scope;
}
function rootCatch$1(error) {
	throw error;
}
function link$1(dep, sub) {
	const prevDep = sub._depsTail;
	if (prevDep !== null && prevDep._dep === dep) return;
	let nextDep = null;
	const isRecomputing = sub._flags & REACTIVE_RECOMPUTING_DEPS$1;
	if (isRecomputing) {
		nextDep = prevDep !== null ? prevDep._nextDep : sub._deps;
		if (nextDep !== null && nextDep._dep === dep) {
			nextDep._lastValue = dep._value;
			nextDep._gen = sub._depGen;
			sub._depsTail = nextDep;
			return;
		}
	}
	const prevSub = dep._subsTail;
	if (prevSub !== null && prevSub._sub === sub && (!isRecomputing || prevSub._gen === sub._depGen)) return;
	markEpoch$1++;
	const newLink = {
		_dep: dep,
		_sub: sub,
		_nextDep: nextDep,
		_prevSub: prevSub,
		_nextSub: null,
		_lastValue: dep._value,
		_gen: sub._depGen
	};
	sub._depsTail = newLink;
	if (prevDep !== null) prevDep._nextDep = newLink;
	else sub._deps = newLink;
	dep._subsTail = newLink;
	if (prevSub !== null) prevSub._nextSub = newLink;
	else dep._subs = newLink;
}
function unlinkSubs$1(linkNode) {
	const dep = linkNode._dep;
	const nextDep = linkNode._nextDep;
	const nextSub = linkNode._nextSub;
	const prevSub = linkNode._prevSub;
	if (nextSub !== null) nextSub._prevSub = prevSub;
	else dep._subsTail = prevSub;
	if (prevSub !== null) prevSub._nextSub = nextSub;
	else dep._subs = nextSub;
	if (dep._subs === null && dep._unobserved) dep._unobserved();
	return nextDep;
}
function cleanupDeps$1(sub) {
	let link = sub._deps;
	while (link !== null) link = unlinkSubs$1(link);
	sub._deps = null;
	sub._depsTail = null;
}
/**
* Bumped whenever any invalidation mark is consumed (recompute, validation,
* self-mark drop) or the topology changes. While the epoch is unchanged,
* marks already placed are still standing, so neither a signal that already
* propagated nor a pure node already visited needs to be walked again.
* Doubles as the propagation wave id.
*/
var markEpoch$1 = 1;
var markWave$1 = 0;
var waveEpoch$1 = 0;
/**
* Mark a node CHECK or DIRTY. Effects are inserted into their heap;
* pure computeds propagate CHECK to their subscribers (lazy pull).
*
* Epoch stamps make a propagation re-traverse pure nodes that are still
* marked from an earlier epoch (a downstream effect may have dropped its
* self-mark since), while deduplicating within one epoch - diamonds visit
* each node once, and so do repeated writes that consumed no marks.
*/
function markNode$1(node, newState) {
	const flags = node._flags;
	if (flags & REACTIVE_DISPOSED$1) return;
	const current = flags & 3;
	if (node._kind !== EFFECT_PURE$1) {
		if (current < newState) node._flags = flags & -4 | newState;
		else if (flags & 12) return;
		insertIntoHeap$1(node, heapFor$1(node));
		schedule$1();
		return;
	}
	if (node._wave === markWave$1) {
		if (current < newState) node._flags = flags & -4 | newState;
		return;
	}
	node._wave = markWave$1;
	if (current < newState) node._flags = flags & -4 | newState;
	for (let l = node._subs; l !== null; l = l._nextSub) markNode$1(l._sub, REACTIVE_CHECK$1);
}
/**
* Open a propagation wave. A wave is a traversal id, not a call id: while the
* epoch is unchanged no mark has been consumed anywhere, so every node the
* current wave already visited still carries the mark it was given and still
* has its own subscribers marked. Re-opening the wave under those conditions
* would only re-walk ground that is still standing, which is what made a
* four-write batch cost four full traversals instead of one.
*/
function openWave$1() {
	if (waveEpoch$1 !== markEpoch$1) {
		markWave$1++;
		waveEpoch$1 = markEpoch$1;
	}
}
/**
* Notify subscribers of a changed node.
* `state` is DIRTY for unconditional recompute (equals: false sources,
* errors, async transitions), CHECK otherwise (value comparison gates).
*/
function propagate$1(node, state) {
	openWave$1();
	for (let l = node._subs; l !== null; l = l._nextSub) markNode$1(l._sub, state);
}
/**
* Re-mark subscribers of a pure computed that just recomputed, WITHOUT
* re-walking the closure below them.
*
* The invariant that makes this sound: `markNode` never marks a pure node
* without also marking that node's subscribers, so a pure node that is
* currently marked has its whole descendant closure marked at CHECK or above.
* A recompute is always reached through such a mark, so by the time a value
* changes here, everything downstream was already told to revalidate by the
* write that started the pull. Walking it again is pure re-traversal - and it
* is what made propagation quadratic in graph depth (F1): with 800 layers the
* sweep spent 54M `markNode` calls to place marks that were already there.
*
* What the direct level still needs is the CHECK -> DIRTY upgrade, because
* DIRTY is the only mark that survives an `equals` comparison against an
* unchanged snapshot. One level below that, CHECK is sufficient: any change
* must pass through a direct subscriber to reach them.
*
* A subscriber that is CLEAN is the one case the invariant says nothing about,
* so it gets the full walk. It is reachable when a link outlived the mark that
* created it - and being unreachable in the common case is exactly why it must
* not be assumed away.
*/
function repropagate$1(node, state) {
	for (let l = node._subs; l !== null; l = l._nextSub) {
		const sub = l._sub;
		const flags = sub._flags;
		if (flags & REACTIVE_DISPOSED$1) continue;
		const current = flags & 3;
		if (sub._kind !== EFFECT_PURE$1) {
			if (current < state) sub._flags = flags & -4 | state;
			else if (flags & 12) continue;
			insertIntoHeap$1(sub, heapFor$1(sub));
			schedule$1();
			continue;
		}
		if (current === 0) {
			openWave$1();
			markNode$1(sub, state);
			continue;
		}
		if (current < state) sub._flags = flags & -4 | state;
	}
}
function depEquals$1(dep, a, b) {
	const eq = dep._equals;
	if (eq === false || eq === defaultEquals$1) return a === b || a !== a && b !== b;
	return eq(a, b);
}
/**
* Resolve CHECK/DIRTY state. CHECK walks deps in read order: computed deps
* are validated recursively, then each dep's current value is compared with
* the snapshot taken at link time. Only an actual change recomputes.
*/
function updateIfNecessary$1(node) {
	const flags = node._flags;
	if (flags & REACTIVE_DISPOSED$1) return;
	if (!(flags & 3)) return;
	if (flags & REACTIVE_DIRTY$1) {
		recompute$1(node);
		return;
	}
	for (let d = node._deps; d !== null; d = d._nextDep) {
		const dep = d._dep;
		if (dep._fn !== void 0) {
			updateIfNecessary$1(dep);
			if (node._flags & REACTIVE_DIRTY$1) {
				recompute$1(node);
				return;
			}
			if (dep._flags & 384) {
				recompute$1(node);
				return;
			}
		}
		if (!depEquals$1(dep, d._lastValue, dep._value)) {
			recompute$1(node);
			return;
		}
	}
	node._flags &= -2;
	markEpoch$1++;
}
/** Run disposal-phase callbacks untracked so reads don't leak into parents */
/**
* O3.6: a cleanup that throws routes to the scope's catcher and MUST NOT abort
* the remaining cleanups. `catcher` is copied at `enter`, so reaching it is a
* field read rather than a walk — and it is the reader that field was missing:
* it was written by `makeScope` and `enterRoot` and consulted by nothing, which
* made E1 look covered by a cost with no behaviour attached.
*
* A catcher that rethrows (the root's) still may not abort the unwind, so the
* rethrow is caught here and reported. What routing buys is that a boundary
* ABOVE the dying scope sees the error at all.
*/
function runUntracked$1(fn, catcher = null, scope) {
	const prevTracking = tracking$1;
	const prevObserver = currentObserver$1;
	tracking$1 = false;
	currentObserver$1 = null;
	try {
		fn();
	} catch (err) {
		if (catcher !== null) try {
			catcher.handle(err, scope);
			return;
		} catch {}
		console.error("Error in cleanup:", err);
	} finally {
		tracking$1 = prevTracking;
		currentObserver$1 = prevObserver;
	}
}
/** Effect cleanup before re-run/dispose: children first, then own cleanups */
function runEffectCleanups$1(node) {
	const scope = node._scope;
	if (scope !== null) {
		scope.gen++;
		unwindKids$1(scope);
	}
	if (node._cleanup) {
		const cleanup = node._cleanup;
		node._cleanup = void 0;
		runUntracked$1(cleanup);
	}
	if (scope !== null) unwindCleanups$1(scope);
}
function registerWithBoundary$1(node) {
	const found = lookupNodeContext$1(node, LOADING_BOUNDARY$1);
	const handle = found === CONTEXT_MISS$1 ? void 0 : found;
	if (handle) {
		node._boundary = handle;
		handle.add(node);
		return;
	}
	emitDiagnostic("ASYNC_OUTSIDE_LOADING_BOUNDARY", "warning", "An effect read a pending async value with no Loading boundary above it; it will retry when the value resolves but nothing renders a fallback.", node._name);
}
function unregisterFromBoundary$1(node) {
	if (node._boundary) {
		node._boundary.delete(node);
		node._boundary = null;
	}
}
var flushError$1 = null;
/**
* Route an effect error to the nearest error boundary, else rethrow.
* During a flush the rethrow is deferred to the end of the flush so the
* remaining queued effects still run (a failed effect must not strand
* unrelated work in the queue).
*/
function handleEffectError$1(node, error) {
	const routed = lookupNodeContext$1(node, ERROR_BOUNDARY$1);
	const handler = routed === CONTEXT_MISS$1 ? void 0 : routed;
	if (handler) {
		handler(error);
		return;
	}
	if (isFlushing$1) {
		if (!flushError$1) flushError$1 = { error };
		return;
	}
	throw error;
}
function recompute$1(node) {
	if (node._flags & REACTIVE_DISPOSED$1) return;
	markEpoch$1++;
	const isEffect = node._kind !== EFFECT_PURE$1;
	deleteFromHeap$1(node, isEffect ? heapFor$1(node) : renderHeap$1);
	const owned = node._scope;
	if (node._cleanup !== void 0 || owned !== null && (owned.cleanups !== null && owned.cleanups.length > 0 || owned.kids !== null && owned.kids.length > 0)) runEffectCleanups$1(node);
	const wasPending = (node._flags & STATUS_PENDING$1) !== 0;
	node._flags &= -388;
	node._error = void 0;
	node._depsTail = null;
	node._depGen++;
	const prevObserver = currentObserver$1;
	const prevTracking = tracking$1;
	const prevOwner = currentOwner$1;
	const prevHost = currentHost$1;
	currentObserver$1 = node;
	node._flags |= REACTIVE_RECOMPUTING_DEPS$1;
	tracking$1 = true;
	currentOwner$1 = node._scope;
	currentHost$1 = node;
	let newValue;
	let threw = false;
	let notReady = false;
	let error;
	try {
		newValue = node._fn(node._flags & REACTIVE_UNINITIALIZED$1 ? void 0 : node._value);
	} catch (err) {
		threw = true;
		if (err instanceof NotReadyError$1) notReady = true;
		else error = err;
	} finally {
		tracking$1 = prevTracking;
		currentObserver$1 = prevObserver;
		node._flags &= -5;
		currentOwner$1 = prevOwner;
		currentHost$1 = prevHost;
	}
	const depsTail = node._depsTail;
	let toRemove = depsTail !== null ? depsTail._nextDep : node._deps;
	if (toRemove !== null) {
		if (depsTail !== null) depsTail._nextDep = null;
		else node._deps = null;
		while (toRemove !== null) toRemove = unlinkSubs$1(toRemove);
	}
	if (threw) {
		if (notReady) {
			if (!isEffect && node._loadingWindow === true) return;
			node._flags |= STATUS_PENDING$1;
			if (isEffect) registerWithBoundary$1(node);
			else {
				if (activeAsyncSession$1 !== null) node._session = activeAsyncSession$1;
				if (!wasPending) propagate$1(node, REACTIVE_DIRTY$1);
			}
		} else {
			if (isEffect) {
				clearSelfMarks$1(node);
				handleEffectError$1(node, error);
				return;
			}
			node._loadingWindow = false;
			node._error = error;
			node._flags |= STATUS_ERROR$1;
			propagate$1(node, REACTIVE_DIRTY$1);
		}
		if (isEffect) clearSelfMarks$1(node);
		return;
	}
	const source = isEffect ? null : asyncSourceOf$1(newValue);
	if (source !== null) {
		node._closeAsync?.();
		node._closeAsync = void 0;
		const id = node._asyncId = (node._asyncId ?? 0) + 1;
		if (node._loadingWindow !== true) {
			node._flags |= STATUS_PENDING$1;
			if (!wasPending) propagate$1(node, REACTIVE_DIRTY$1);
		}
		const session = activeAsyncSession$1 ?? node._session ?? null;
		node._session = session;
		/** The node is superseded, disposed, or was never this run's */
		const stale = () => (node._flags & REACTIVE_DISPOSED$1) !== 0 || node._asyncId !== id;
		const settled = (value) => {
			node._loadingWindow = false;
			node._flags &= -193;
			node._value = value;
			if (node._serializeKey !== void 0) recordHydrationValue$1(node._session ?? null, node._serializeKey, value);
			propagate$1(node, REACTIVE_DIRTY$1);
			schedule$1();
		};
		const failed = (err) => {
			node._loadingWindow = false;
			node._flags = node._flags & -129 | STATUS_ERROR$1;
			node._error = err;
			propagate$1(node, REACTIVE_DIRTY$1);
			schedule$1();
		};
		if (source.iterator === null) {
			const awaited = source.thenable;
			if (node._inFlight) inFlight$1.delete(node._inFlight);
			node._inFlight = awaited;
			inFlight$1.set(awaited, session);
			awaited.then((value) => {
				inFlight$1.delete(awaited);
				if (stale()) return;
				settled(value);
			}, (err) => {
				inFlight$1.delete(awaited);
				if (stale()) return;
				failed(err);
			});
			return;
		}
		pumpAsyncIterator$1(node, source.iterator, session, stale, settled, failed);
		return;
	}
	if (isEffect && wasPending) unregisterFromBoundary$1(node);
	node._loadingWindow = false;
	if ((node._flags & REACTIVE_UNINITIALIZED$1) !== 0 || wasPending || node._equals === false || !node._equals(node._value, newValue)) {
		node._value = newValue;
		if (!isEffect) repropagate$1(node, node._equals === false || wasPending ? REACTIVE_DIRTY$1 : REACTIVE_CHECK$1);
	}
	if (isEffect) {
		if (node._apply) {
			const prev = node._appliedValue;
			node._appliedValue = newValue;
			const apply = node._apply;
			const prevT = tracking$1;
			const prevO = currentObserver$1;
			const applyOwner = currentOwner$1;
			const applyHost = currentHost$1;
			tracking$1 = false;
			currentObserver$1 = null;
			currentOwner$1 = node._scope;
			currentHost$1 = node;
			try {
				const cleanup = apply(newValue, prev);
				if (typeof cleanup === "function") node._cleanup = cleanup;
			} finally {
				tracking$1 = prevT;
				currentObserver$1 = prevO;
				currentOwner$1 = applyOwner;
				currentHost$1 = applyHost;
			}
		} else if (typeof newValue === "function") node._cleanup = newValue;
	}
	node._flags &= -65;
	if (isEffect) clearSelfMarks$1(node);
}
/**
* Writes from an effect to its own dependencies do not re-trigger the
* effect (self-marks are dropped after the run). Pure computeds keep
* self-marks so the next read revalidates.
*
* When a self-mark is dropped, dep snapshots are resynced to the values
* the effect itself wrote — those count as "seen", so only a later
* external change re-triggers the effect.
*/
function clearSelfMarks$1(node) {
	if (node._flags & 3) {
		for (let d = node._deps; d !== null; d = d._nextDep) d._lastValue = d._dep._value;
		node._flags &= -4;
		markEpoch$1++;
	}
}
function disposeNode$1(node) {
	if (node._flags & REACTIVE_DISPOSED$1) return;
	node._flags |= REACTIVE_DISPOSED$1;
	if (node._inFlight) {
		inFlight$1.delete(node._inFlight);
		node._inFlight = void 0;
	}
	node._closeAsync?.();
	node._closeAsync = void 0;
	unregisterFromBoundary$1(node);
	const scope = node._scope;
	if (scope !== null) {
		scope.dead = true;
		scope.gen++;
		unwindKids$1(scope);
	}
	if (node._cleanup) {
		const cleanup = node._cleanup;
		node._cleanup = void 0;
		runUntracked$1(cleanup);
	}
	if (scope !== null) {
		unwindCleanups$1(scope);
		const abort = scope._abort;
		if (abort !== null) {
			scope._abort = null;
			abort.abort();
		}
		const range = scope._range;
		if (range !== null) {
			scope._range = null;
			range();
		}
	}
	deleteFromHeap$1(node, node._kind === EFFECT_USER$1 ? userHeap$1 : renderHeap$1);
	cleanupDeps$1(node);
	node._subs = null;
	node._subsTail = null;
}
var isFlushing$1 = false;
/** Schedule an async flush on the microtask queue (latches until flush) */
function schedule$1() {
	if (scheduled$1 || isFlushing$1 || batchDepth > 0) return;
	scheduled$1 = true;
	queueMicrotask(() => {
		scheduled$1 = false;
		flushSync$1();
	});
}
/**
* Synchronously drain all scheduled effects.
* Render effects always run before user effects within each pass.
*/
function flushSync$1() {
	if (isFlushing$1 || batchDepth > 0) return;
	isFlushing$1 = true;
	dropOrphans$1();
	flushError$1 = null;
	try {
		let count = 0;
		while (renderHeap$1._count > 0 || userHeap$1._count > 0) {
			if (++count === 1e5) {
				emitDiagnostic("INFINITE_LOOP", "error", "Flush did not settle after 100000 iterations; an effect is likely writing a value it depends on.");
				throw new Error("Potential infinite loop detected");
			}
			clock$1++;
			if (renderHeap$1._count > 0) runHeap$1(renderHeap$1);
			else runHeap$1(userHeap$1);
		}
		const pendingError = flushError$1;
		if (pendingError) {
			flushError$1 = null;
			throw pendingError.error;
		}
	} finally {
		isFlushing$1 = false;
	}
}
/**
* Synchronously flush all pending updates.
* With a callback, runs it first so its writes are applied by the flush.
*/
function flush$1(fn) {
	if (fn) fn();
	flushSync$1();
}
function defaultEquals$1(a, b) {
	return a === b || a !== a && b !== b;
}
/**
* Create a reactive signal.
*
* `signal(value)` - plain writable signal
* `signal(fn)` - writable derived signal: recomputed by fn(prev) when its
* dependencies change, and writable via set/update until they do.
*/
function signal$1(initialValue, options) {
	if (typeof initialValue === "function") return writableComputed$1(initialValue, options);
	const node = {
		_value: initialValue,
		_subs: null,
		_subsTail: null,
		_equals: options?.equals !== void 0 ? options.equals : defaultEquals$1,
		_name: options?.name,
		_unobserved: options?.unobserved,
		_epoch: 0,
		_fn: void 0,
		_affected: 0,
		_override: null
	};
	const read = () => {
		if (slowSignalRead$1 !== 0) return readSignalSlow$1(node);
		if (!tracking$1) return node._value;
		if (currentObserver$1 && !(currentObserver$1._flags & REACTIVE_DISPOSED$1)) link$1(node, currentObserver$1);
		return node._value;
	};
	const ownedWrite = options?.ownedWrite === true;
	const write = (newValue) => {
		if (diagnosticsOn && !ownedWrite && tracking$1 && currentObserver$1 !== null && currentObserver$1._kind === EFFECT_PURE$1) emitDiagnostic("REACTIVE_WRITE_IN_OWNED_SCOPE", "warning", "Signal written from inside a derived computation; derive the value instead, or create the signal with { ownedWrite: true }.", node._name);
		const eq = node._equals;
		const prev = node._value;
		if (eq === defaultEquals$1) {
			if (prev === newValue || prev !== prev && newValue !== newValue) return;
		} else if (eq !== false && eq(prev, newValue)) return;
		node._value = newValue;
		if (node._subs !== null && node._epoch !== markEpoch$1) {
			node._epoch = markEpoch$1;
			propagate$1(node, eq === false ? REACTIVE_DIRTY$1 : REACTIVE_CHECK$1);
		}
	};
	const accessor = read;
	accessor.set = write;
	accessor.update = (fn) => write(fn(node._value));
	accessor.peek = () => slowSignalRead$1 !== 0 && node._override !== null && latestDepth === 0 ? foldOverride$1(node) : node._value;
	accessor._node = node;
	return accessor;
}
function createComputedNode$1(fn, kind, options) {
	const host = currentHost$1;
	const owner = getCurrentOwner$1();
	if (host !== null && host._flags & REACTIVE_CHILDREN_FORBIDDEN$1) emitDiagnostic("PRIMITIVE_IN_FORBIDDEN_SCOPE", "error", "Reactive primitives cannot be created inside trackedEffect; it is a leaf effect for wiring external sources.", options?.name);
	let initialHeight = 0;
	if (currentObserver$1) initialHeight = currentObserver$1._height + 1;
	const node = {
		_value: void 0,
		_subs: null,
		_subsTail: null,
		_override: null,
		_equals: kind === EFFECT_PURE$1 ? options?.equals !== void 0 ? options.equals : defaultEquals$1 : false,
		_name: options?.name,
		_unobserved: options?.unobserved,
		_epoch: 0,
		_fn: fn,
		_affected: 0,
		_deps: null,
		_depsTail: null,
		_flags: 66,
		_height: initialHeight,
		_nextHeap: void 0,
		_prevHeap: null,
		_kind: kind,
		_depGen: 0,
		_owner: owner,
		_scope: null,
		_cleanup: void 0,
		_apply: void 0,
		_error: void 0,
		_wave: 0
	};
	node._prevHeap = node;
	if (options !== void 0 && "loadingValue" in options) {
		node._value = options.loadingValue;
		node._loadingWindow = true;
		node._flags &= -65;
	}
	if (owner !== null) (owner.kids ??= []).push(node);
	else if (kind !== EFFECT_PURE$1) orphans$1.push(node);
	if (externalSource$1 !== null) wireExternalSource$1(node, owner);
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.own(node, owner, kind === EFFECT_RENDER$1 ? "render" : kind === EFFECT_USER$1 ? "user" : "pure");
	return node;
}
/** Shared read implementation for computed/writable-derived accessors */
function computedRead$1(node) {
	const flags = node._flags;
	if (!tracking$1 && !(flags & 1443)) return node._value;
	if (flags & REACTIVE_DISPOSED$1) return node._value;
	if (flags & 3) updateIfNecessary$1(node);
	if (tracking$1 && currentObserver$1 && !(currentObserver$1._flags & REACTIVE_DISPOSED$1)) {
		link$1(node, currentObserver$1);
		if (node._height >= currentObserver$1._height) currentObserver$1._height = node._height + 1;
	}
	if (node._flags & STATUS_ERROR$1) throw node._error;
	if (node._flags & 1152) {
		if (latestDepth > 0 && (currentObserver$1 === null || !(node._flags & REACTIVE_UNINITIALIZED$1))) return node._value;
		throw new NotReadyError$1(node);
	}
	return node._value;
}
function computedPeek$1(node) {
	if (node._flags & 3 && !(node._flags & REACTIVE_DISPOSED$1)) {
		const prevTracking = tracking$1;
		const prevObserver = currentObserver$1;
		tracking$1 = false;
		currentObserver$1 = null;
		try {
			updateIfNecessary$1(node);
		} finally {
			tracking$1 = prevTracking;
			currentObserver$1 = prevObserver;
		}
	}
	return node._value;
}
/**
* Create a computed signal that derives its value from other signals.
* Lazy: evaluated on first read, revalidated on read after invalidation.
*
* **This is the async primitive too.** A compute that returns a Promise leaves
* the computed pending until it resolves, and a read in the meantime throws
* `NotReadyError` — which `Loading` catches, `isPending` reports and `latest`
* reads through. There is no second constructor for async values, which is
* also where Solid 2.0 landed: their signals package ships `createMemo` and no
* async primitive at all.
*
* ## SSR seeding
*
* A pending value resolved on the server is recorded (`getHydrationData` /
* `generateHydrationScript`) and consumed from `__BARQ_DATA__` on the client,
* so the first read resolves synchronously with the server's answer instead of
* refetching. The seeded first run does not track `fn`'s dependencies; use
* `refresh()` to refetch.
*
* The serialization key is taken HERE, at creation, from the owner-tree id —
* never at first read, because the two orders differ between server and client
* and the id has to be the same on both. With no owner there is no tree to key
* off and nothing is serialized.
*
* A position is not an identity: if the client tree diverges from the server's,
* the ids after the divergence shift, and a read can claim the value recorded
* for a DIFFERENT call and resolve synchronously with it. `name` folds an
* identity into the auto-key — siblings only have to differ from each other,
* and a drifted key then misses and refetches instead of seeding the wrong
* value. `key` replaces the auto-key outright and has to be unique across the
* page. `unclaimedSeeds()` reports the drift after the fact; `hydrate()` calls
* it once the first render has settled.
*/
function computed(fn, options) {
	const owner = currentOwner$1;
	const slot = options?.key === void 0 && owner !== null ? reserveChildSlot(owner) : -1;
	const key = () => {
		if (options?.key !== void 0) return options.key;
		return owner !== null && slot >= 0 ? formatReserved(owner, slot, options?.name) : void 0;
	};
	let trySeed = true;
	const compute = (prev) => {
		if (trySeed) {
			trySeed = false;
			const id = key();
			if (id !== void 0) {
				node._serializeKey = id;
				const settledHere = recordedInSession(id);
				if (settledHere.found) return settledHere.value;
				const seed = getSeed(id);
				if (seed.found) return seed.value;
				const later = seedLater(id);
				if (later !== null) return later.then((arrived) => arrived.found ? arrived.value : fn(prev));
			}
		}
		return fn(prev);
	};
	const node = createComputedNode$1(compute, EFFECT_PURE$1, options);
	const accessor = (() => computedRead$1(node));
	accessor.peek = () => computedPeek$1(node);
	accessor._node = node;
	return accessor;
}
/** Writable derived signal: signal(fn) */
function writableComputed$1(fn, options) {
	const node = createComputedNode$1(fn, EFFECT_PURE$1, options);
	const write = (newValue) => {
		if (node._flags & REACTIVE_UNINITIALIZED$1) computedPeek$1(node);
		if (!(node._equals === false || !node._equals(node._value, newValue))) return;
		node._value = newValue;
		if (node._subs !== null) propagate$1(node, node._equals === false ? REACTIVE_DIRTY$1 : REACTIVE_CHECK$1);
	};
	const accessor = (() => computedRead$1(node));
	accessor.set = write;
	accessor.update = (f) => write(f(computedPeek$1(node)));
	accessor.peek = () => computedPeek$1(node);
	accessor._node = node;
	return accessor;
}
function createEffectNode$1(compute, apply, kind) {
	effectsAllocated$1++;
	const node = createComputedNode$1(compute, kind);
	node._apply = apply;
	recompute$1(node);
	return () => disposeNode$1(node);
}
/**
* Render-phase effect: runs synchronously at creation and before user
* effects on subsequent flushes. Used by the renderer for DOM bindings.
*/
function renderEffect$1(compute, apply) {
	return createEffectNode$1(compute, apply, EFFECT_RENDER$1);
}
/**
* Register a cleanup function for the current owner.
* Returns the function for convenience.
*/
function onCleanup(fn) {
	const owner = getCurrentOwner$1();
	if (owner) (owner.cleanups ??= []).push(fn);
	else orphanCleanups$1.push(fn);
	return fn;
}
/**
* Create a reactive scope with optional automatic disposal.
*
* - `scope(fn)` - Auto-disposed when parent disposes (default)
* - `scope(fn, true)` - Detached, requires manual disposal
*/
function scope(fn, detached = false, kind = "scope") {
	return runInOwner(createOwnerScope(!detached, kind), fn);
}
/**
* Internal: create a scope, optionally registered with the scope above it.
*
* A child scope goes into `kids`, never into `cleanups`. O3 spells out why:
* while a scope held its kids and its cleanups in one list, O3.2's ordering
* claim and O3.3's had no observation that could tell them apart, so a
* FIFO-cleanup bug reported as a kid-ordering violation.
*/
function createOwnerScope(registerWithParent, kind = "scope") {
	const parent = getCurrentOwner$1();
	const scope = makeScope$1(parent);
	scope.dispose = () => disposeScope$1(scope);
	const holder = registerWithParent ? parent : null;
	if (holder !== null) (holder.kids ??= []).push(scope);
	if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.enter(scope, parent, kind, holder !== null);
	return scope;
}
/** Internal: Run function within an owner context */
function runInOwner(owner, fn) {
	const prevOwner = currentOwner$1;
	const prevHost = currentHost$1;
	currentOwner$1 = owner;
	currentHost$1 = null;
	try {
		return fn(owner.dispose, owner);
	} finally {
		currentOwner$1 = prevOwner;
		currentHost$1 = prevHost;
		if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.exit(owner);
	}
}
var childCounts = /* @__PURE__ */ new WeakMap();
var ownerIds = /* @__PURE__ */ new WeakMap();
var rootCounts$1 = /* @__PURE__ */ new Map();
function formatChildId(prefix, index) {
	const num = index.toString(36);
	const len = num.length - 1;
	return prefix + (len ? String.fromCharCode(64 + len) : "") + num;
}
function nextRootId() {
	const epoch = activeAsyncSession$1;
	const next = rootCounts$1.get(epoch) ?? 0;
	rootCounts$1.set(epoch, next + 1);
	return `r${next.toString(36)}`;
}
function ownerId(owner) {
	let id = ownerIds.get(owner);
	if (id === void 0) {
		const parent = owner.parent;
		id = parent !== null ? getNextChildId(parent) : nextRootId();
		ownerIds.set(owner, id);
	}
	return id;
}
/**
* Start a fresh id epoch. Server renders get one for free (each carries its
* own async session); the client's epoch spans the page, so only reused
* processes and tests need to call this.
*/
function resetChildIds$1(session) {
	if (session !== void 0) rootCounts$1.delete(session);
	else rootCounts$1.clear();
}
/** Allocate the next stable child id for `owner` (consumes the counter). */
function getNextChildId(owner) {
	const next = childCounts.get(owner) ?? 0;
	childCounts.set(owner, next + 1);
	return formatChildId(ownerId(owner), next);
}
/**
* Consume an owner-tree slot WITHOUT formatting its id.
*
* Every `computed` reserves one, so the numbering is the same on both sides of
* a render — but only a value that actually settles asynchronously is ever
* serialised, and only then is the string built. Formatting eagerly would put a
* string allocation on the hottest constructor in the system for a key almost
* no node uses.
*/
function reserveChildSlot(owner) {
	const next = childCounts.get(owner) ?? 0;
	childCounts.set(owner, next + 1);
	return next;
}
/** The id `reserveChildSlot` reserved, formatted on demand. */
function formatReserved(owner, index, name) {
	const id = formatChildId(ownerId(owner), index);
	return name === void 0 ? id : `${id}~${name}`;
}
/**
* Read signals without creating dependencies.
* Note: Owner context is maintained (only tracking is disabled).
*/
function untrack(fn) {
	if (externalSource$1 !== null) return externalSource$1.untrack(() => untrackInner(fn));
	return untrackInner(fn);
}
function untrackInner(fn) {
	const prevTracking = tracking$1;
	tracking$1 = false;
	try {
		return fn();
	} finally {
		tracking$1 = prevTracking;
	}
}
/** In-flight async computations, stamped with the session that started them */
var inFlight$1 = /* @__PURE__ */ new Map();
/**
* Promises/A+ shape. `instanceof Promise` is a test about the CONSTRUCTOR, and
* a thenable from another realm, another library, or a transpiled async
* function is none the less awaitable — `await` itself asks this question, so a
* reactivity core that asks the narrower one disagrees with the language.
*/
function isThenable$1(value) {
	return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
/**
* What kind of async a compute's return value is, or `null` for a plain value.
* An async iterable is checked FIRST: an async generator object is not a
* thenable, but a hand-written source may be both, and the stream is the
* stronger claim.
*
* The probe is untracked. The value may be a store proxy, and a `get` on one
* registers a dependency — on whatever observer happens to be current, since by
* here the recompute has already restored the outer one.
*/
function asyncSourceOf$1(value) {
	if (value === null || typeof value !== "object" && typeof value !== "function") return null;
	const prevTracking = tracking$1;
	const prevObserver = currentObserver$1;
	tracking$1 = false;
	currentObserver$1 = null;
	try {
		const method = value[Symbol.asyncIterator];
		if (typeof method === "function") return {
			iterator: method.call(value),
			thenable: null
		};
		return isThenable$1(value) ? {
			iterator: null,
			thenable: value
		} : null;
	} finally {
		tracking$1 = prevTracking;
		currentObserver$1 = prevObserver;
	}
}
/**
* Drain an async iterable into a computed, one yield at a time.
*
* The node is PENDING until the FIRST yield and settled from then on: a stream
* is in flight until it has an answer, and after that it is a value that keeps
* changing, which is a signal being written and not a boundary's business. The
* alternative — re-suspending per step — flaps every `Loading` above it once
* per element, and the fallback is exactly what a stream exists to avoid.
*
* `inFlight` therefore carries the FIRST step only, so `settle()` waits for the
* stream's first answer rather than for a producer that may never finish.
*
* Disposal and supersession both close the iterator through `_closeAsync`,
* which is what runs a generator's own `finally` and stops an endless producer.
*/
function pumpAsyncIterator$1(node, iterator, session, stale, settled, failed) {
	let closed = false;
	let first = true;
	const close = () => {
		if (closed) return;
		closed = true;
		try {
			const returned = iterator.return?.();
			if (isThenable$1(returned)) returned.then(void 0, () => {});
		} catch {}
	};
	node._closeAsync = close;
	const step = () => {
		if (closed || stale()) {
			close();
			return;
		}
		let result;
		try {
			result = iterator.next();
		} catch (err) {
			closed = true;
			if (!stale()) failed(err);
			return;
		}
		const awaited = isThenable$1(result) ? result : Promise.resolve(result);
		if (first) {
			if (node._inFlight) inFlight$1.delete(node._inFlight);
			node._inFlight = awaited;
			inFlight$1.set(awaited, session);
		}
		awaited.then((next) => {
			if (first) {
				inFlight$1.delete(awaited);
				node._inFlight = void 0;
			}
			if (stale()) {
				close();
				return;
			}
			if (next.done === true) {
				closed = true;
				node._closeAsync = void 0;
				if (first) settled(void 0);
				return;
			}
			first = false;
			settled(next.value);
			step();
		}, (err) => {
			if (first) {
				inFlight$1.delete(awaited);
				node._inFlight = void 0;
			}
			closed = true;
			node._closeAsync = void 0;
			if (!stale()) failed(err);
		});
	};
	step();
}
/** Resolved values of keyed async computeds, bucketed by session (SSR) */
var hydrationData$1 = /* @__PURE__ */ new Map();
/**
* What THIS render already resolved for a key, for the second pass of a string
* render to read back.
*
* Not a cache: it is the same session's own recorded output, and it is not
* consumed, because `getHydrationData` still has to emit it. Returns nothing
* outside a render session, which is what keeps it off the client entirely.
*/
function recordedInSession(key) {
	if (activeAsyncSession$1 === null) return { found: false };
	const bucket = hydrationData$1.get(activeAsyncSession$1);
	if (bucket === void 0 || !bucket.has(key)) return { found: false };
	return {
		found: true,
		value: bucket.get(key)
	};
}
function recordHydrationValue$1(session, key, value) {
	let bucket = hydrationData$1.get(session);
	if (!bucket) {
		bucket = /* @__PURE__ */ new Map();
		hydrationData$1.set(session, bucket);
	}
	bucket.set(key, value);
}
/** Session active while a fetch starts; lets settle() wait only its own work */
var activeAsyncSession$1 = null;
/**
* Wait until the reactive graph is quiet: flushes synchronously, awaits
* in-flight async computations, and repeats until nothing remains
* (covers async waterfalls). The backbone of renderToStringAsync; also
* handy in tests.
*
* With `session`, only waits for fetches attributed to that session (see
* setAsyncSession) - required on servers where concurrent renders share
* the module graph; fetches triggered by this settle's own flushes are
* attributed automatically.
*/
async function settle(session) {
	flushIn$1(session);
	while (true) {
		const waiting = inFlightOf$1(session);
		if (waiting.length === 0) break;
		await Promise.allSettled(waiting);
		flushIn$1(session);
	}
}
function flushIn$1(session) {
	if (session === void 0) {
		flushSync$1();
		return;
	}
	const prev = activeAsyncSession$1;
	activeAsyncSession$1 = session;
	try {
		flushSync$1();
	} finally {
		activeAsyncSession$1 = prev;
	}
}
function inFlightOf$1(session) {
	const waiting = [];
	for (const [promise, owner] of inFlight$1) if (session === void 0 || owner === session) waiting.push(promise);
	return waiting;
}
/** Client: the payload emitted by generateHydrationScript, if present */
function getSeed(key) {
	const store = globalThis.__BARQ_DATA__;
	if (store && key in store) {
		const value = store[key];
		delete store[key];
		return {
			found: true,
			value
		};
	}
	return { found: false };
}
/**
* A promise for a key that has not arrived yet, or `null` when nothing is
* coming — no channel at all (an ordinary page), or one already closed.
*
* `{ found: false }` rather than a rejection when the stream ends without the
* key: the read then falls back to fetching, which is what a non-streamed page
* does, and a rejection would surface a boundary error for a value that is
* merely absent.
*/
function seedLater(key) {
	const channel = globalThis.__BARQ_SEED__;
	if (channel === void 0 || channel.open !== 1) return null;
	return new Promise((resolve) => {
		channel.wait(key, () => resolve(getSeed(key)));
	});
}
/**
* Seeded values the client never claimed, reported once hydration has settled.
*
* An auto-key is an owner-tree POSITION, so a client tree that is not the
* server's shifts every key after the divergence: a read can then claim a value
* recorded for a different call and resolve synchronously with it, which is
* wrong data rather than a refetch. Nothing positional can tell those apart at
* the moment of the read — the key carries no information about what was
* fetched — but the leftovers prove it afterwards, because a shifted tree
* always strands the tail of the payload.
*
* `{ name }` folds an identity into the auto-key, and `{ key }` replaces it
* outright; either takes a read out of the positional scheme.
*/
function unclaimedSeeds$1() {
	const store = globalThis.__BARQ_DATA__;
	const unclaimed = store === void 0 ? [] : Object.keys(store);
	if (unclaimed.length !== 0) emitDiagnostic("HYDRATION_SEED_DRIFT", "warning", `${unclaimed.length} seeded async value(s) were never claimed (${unclaimed.join(", ")}). The client's owner tree is not the one the server rendered, so a positional auto-key may have resolved a read with another call's value. Give the reads a \`name\` or a \`key\`.`, void 0, unclaimed);
	return unclaimed;
}
/**
* Non-zero while any rare read mode is live (an `affects` mark, a pending
* override). The signal read tests this one global before doing anything
* unusual, so the ordinary path stays two branches.
*
* Snapshot capture used to be the other occupant. M9 deleted it (§4.1): it had
* no consumer outside its own test, and it cost a `_snapshot` slot on EVERY
* signal node — which §4.2 states as a hard budget, because every field is
* present on every instance to keep the shape monomorphic.
*/
var slowSignalRead$1 = 0;
/**
* The read path taken while an affects mark or a pending override is live.
* Kept out of line so the ordinary read stays small enough to inline.
*/
function readSignalSlow$1(node) {
	if (node._affected !== 0 && latestDepth === 0) {
		if (tracking$1 && currentObserver$1 !== null && !(currentObserver$1._flags & REACTIVE_DISPOSED$1)) link$1(node, currentObserver$1);
		throw new NotReadyError$1(node);
	}
	if (node._override !== null) {
		if (tracking$1 && currentObserver$1 !== null && !(currentObserver$1._flags & REACTIVE_DISPOSED$1)) link$1(node, currentObserver$1);
		if (latestDepth > 0) return node._value;
		return foldOverride$1(node);
	}
	if (!tracking$1) return node._value;
	const observer = currentObserver$1;
	if (observer === null || observer._flags & REACTIVE_DISPOSED$1) return node._value;
	link$1(node, observer);
	return node._value;
}
function foldOverride$1(node) {
	const layers = node._override;
	const prevTracking = tracking$1;
	tracking$1 = false;
	try {
		let value = node._value;
		for (let i = 0; i < layers.length; i++) value = layers[i].patch(value);
		return value;
	} finally {
		tracking$1 = prevTracking;
	}
}
var externalSource$1 = null;
function wireExternalSource$1(node, owner) {
	const bridge = signal$1(void 0, {
		equals: false,
		ownedWrite: true
	});
	const source = externalSource$1.factory(node._fn, () => bridge.set(void 0));
	if (owner !== null) (owner.cleanups ??= []).push(() => source.dispose());
	node._fn = (prev) => {
		bridge();
		return source.track(prev);
	};
}
/**
* Create a context for dependency injection.
*/
function context(defaultValue, description) {
	const id = Symbol(description ?? "context");
	/**
	* X1: enter -> fork -> write -> INVOKE, in that order, under the scope the
	* caller passed. `children` is a Block, so there is no expression in the
	* emitted language that means "children, already built": the only party
	* holding the instance scope is this function, and it writes the binding
	* before it hands the scope over.
	*/
	const Provider = (s, props) => {
		const instance = enter(requireScope$1(s, "Ctx.Provider"), "provide");
		provideOn$1(instance, id, cellOf(props.value));
		let built = false;
		try {
			if (typeof props.children !== "function") return props.children;
			if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockEnter("Provider.children", instance);
			const out = unwrapBlocks(props.children(instance), instance);
			if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockExit("Provider.children");
			built = true;
			return out;
		} finally {
			exit$1(instance);
			if (!built) disposeScope$1(instance);
		}
	};
	return {
		id,
		defaultValue,
		Provider
	};
}
/**
* A Block that arrived wrapped in a Cell — `children: () => props.children` —
* is still a Block, and it has to run inside the scope that carries the
* binding. Resolving it at the INSERTION site instead runs it after `exit`,
* under the caller's scope, which is O2's negation with extra steps.
*
* Rule 4: kind travels with the value. Only a BRANDED Block is unwrapped, so a
* live hole (`() => count()`) survives as the `Cell<Out>` that `Out` admits and
* a row callback in a children slot is never handed the scope where its item
* belongs. An arity guess would call both wrong, in opposite directions.
*
* The one speculative call left is an unbranded Cell whose value is a Block,
* which only an uncompiled caller can produce: C5 forwards by identity, so a
* compiled wrapper emits `children: props.children` and the brand arrives
* intact. It is guarded on the RESULT being branded, so a hole is read once and
* returned live rather than recursed into.
*/
function unwrapBlocks(out, instance) {
	let at = out;
	for (;;) {
		if (isBlock$1(at)) {
			at = at(instance);
			continue;
		}
		if (typeof at !== "function") return at;
		const peeked = untrack(() => at(instance));
		if (!isBlock$1(peeked)) return at;
		at = peeked;
	}
}
/**
* X2/§3.0: what a scope stores for a context key is a Cell. Every write site
* that can take a plain value wraps here, so a stored function is always the
* Cell and never a value that happens to be callable — the ambiguity that had
* `getContext` hand back the accessor while `read` handed back its result.
*/
function cellOf(value) {
	return typeof value === "function" ? value : () => value;
}
/**
* Scope — the unit of ownership and the unit of death. `SEMANTICS.md` §2 is
* the specification; `CODESIGN.md` §3.1 and §3.3 are the design.
*
* **Why the implementation is in `signals.ts` and this module is its face.**
* `signals.ts` may acquire neither a value import nor a reassigned top-level
* binding — Bun inlines a module-scope numeric `const` only while it has
* neither, and a signal accessor's `toString()` is snapshotted by
* `diagnostic-accessor-coercion.tsx`. `enter`/`exit` write the ambient owner,
* which lives there, so they live there too. What is genuinely this module's
* is what needs no hot state: the calling conventions, the context channel and
* the root.
*/
/**
* X1: `enter` → fork → write → invoke, in that order, with `CURRENT` restored
* on both paths (O4.1). The value stored is a `Cell`, so a provider whose
* value changes does not re-render its children — consumers see it live (X2).
*/
function provide(scope, context, value, block) {
	const instance = enter(requireScope$1(scope, "provide"));
	if (typeof value === "function") untrack(() => readSlot(value, "provide value"));
	provideOn$1(instance, context.id, value);
	let built = false;
	try {
		let out = block(instance);
		while (isBlock$1(out)) out = out(instance);
		built = true;
		return out;
	} finally {
		exit$1(instance);
		if (!built) disposeScope$1(instance);
	}
}
/**
* X3: a read is a walk of the SCOPE chain, performed whenever the read
* happens, over each scope's own record. A consumer built before a provider
* above it installed still sees the value — which is X3's stated consequence
* and what `ErrorBoundary`'s build-then-install ordering needs to be harmless.
*/
function read(context, scope = getOwner$1()) {
	if (scope !== null) {
		const stored = lookupContext$1(scope, context.id);
		if (stored !== CONTEXT_MISS$1) return cellOf(stored);
	}
	if (context.defaultValue !== void 0) return () => context.defaultValue;
	throw scope === null ? new NoOwnerError() : new ContextNotFoundError();
}
var ALL = {
	keys: null,
	keep: false,
	skipUndefined: false
};
function admits(filter, key) {
	const keys = filter.keys;
	if (keys === null) return true;
	return filter.keep ? keys.has(key) : !keys.has(key);
}
/**
* Flatten a source list one level: a source that is itself a view publishes
* its own list under `$`, and splicing it in keeps a merge of a merge linear
* instead of nesting a proxy per hop (Vue Vapor's `RawProps.$`).
*/
function flatten$2(sources) {
	let nested = false;
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (source !== null && source !== void 0 && Array.isArray(source["$"])) {
			nested = true;
			break;
		}
	}
	if (!nested) return sources;
	const flat = [];
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (source === null || source === void 0) continue;
		const inner = source["$"];
		if (Array.isArray(inner)) {
			const list = flatten$2(inner);
			for (let j = 0; j < list.length; j++) flat.push(list[j]);
		} else flat.push(source);
	}
	return flat;
}
function lookup(sources, filter, key) {
	if (!admits(filter, key)) return void 0;
	for (let i = sources.length - 1; i >= 0; i--) {
		const source = sources[i];
		if (source === null || source === void 0) continue;
		if (!(key in source)) continue;
		const value = source[key];
		if (filter.skipUndefined && value === void 0) continue;
		return value;
	}
}
function present(sources, filter, key) {
	if (!admits(filter, key)) return false;
	for (let i = sources.length - 1; i >= 0; i--) {
		const source = sources[i];
		if (source === null || source === void 0) continue;
		if (!(key in source)) continue;
		if (filter.skipUndefined && source[key] === void 0) continue;
		return true;
	}
	return false;
}
function keysOf(sources, filter) {
	const seen = /* @__PURE__ */ new Set();
	for (let i = 0; i < sources.length; i++) {
		const source = sources[i];
		if (source === null || source === void 0) continue;
		for (const key of Object.keys(source)) {
			if (key === "$") continue;
			if (!admits(filter, key)) continue;
			if (filter.skipUndefined && !present(sources, filter, key)) continue;
			seen.add(key);
		}
	}
	return [...seen];
}
/**
* A live view of a source list. Reads walk the list backwards, so the last
* source wins; `ownKeys`/`has` union it. Nothing is copied and nothing is
* called, so the view is exactly as lazy as the carriers it holds.
*
* An unfiltered view republishes its list under `$`; a filtered one does not,
* because a consumer that spliced the raw list back in would resurrect the
* keys `omit` and `splitProps` exist to remove.
*/
function view(sources, filter) {
	const list = flatten$2(sources);
	return new Proxy({}, {
		get(_target, key) {
			if (typeof key === "symbol") return void 0;
			if (key === "$") return filter.keys === null ? list : void 0;
			return lookup(list, filter, key);
		},
		has(_target, key) {
			if (typeof key === "symbol") return false;
			if (key === "$") return filter.keys === null;
			return present(list, filter, key);
		},
		ownKeys() {
			return keysOf(list, filter);
		},
		getOwnPropertyDescriptor(_target, key) {
			if (typeof key === "symbol" || key === "$") return void 0;
			if (!present(list, filter, key)) return void 0;
			return {
				value: lookup(list, filter, key),
				writable: true,
				enumerable: true,
				configurable: true
			};
		},
		set() {
			return false;
		},
		deleteProperty() {
			return false;
		}
	});
}
/**
* The compiler's spread carrier. `<Foo {...a} b={x} {...c} />` emits
* `Foo($s, props([a, { b: x }, c]))`.
*
* One plain record is returned UNCHANGED — the overwhelming case allocates
* nothing and reads at object speed.
*/
function props(sources) {
	if (sources.length === 1) {
		const only = sources[0];
		if (only !== null && only !== void 0 && !Array.isArray(only["$"])) return only;
	}
	return view(sources, ALL);
}
/**
* The carrier for a prop whose IDENTITY a consumer can observe — a handler, an
* array, an object. It evaluates once, so `props.onClick() === props.onClick()`
* holds under C3.1's totality. A Cell built from an expression is not memoised
* (C3.2); a Cell built from a value has nothing to memoise.
*/
function cell(value) {
	return () => value;
}
/** Passed as a storePath value to remove the property instead of setting it */
var STORE_DELETE = Symbol("barq-store-delete");
function isRange(part) {
	if (part === null || typeof part !== "object" || Array.isArray(part)) return false;
	const r = part;
	return r.from !== void 0 || r.to !== void 0 || r.by !== void 0;
}
function assign(current, key, value) {
	let next = value;
	if (typeof next === "function") next = next(current[key]);
	if (next === STORE_DELETE) {
		delete current[key];
		return;
	}
	current[key] = next;
}
function applyPath(current, parts, index, value) {
	if (current === null || typeof current !== "object") return;
	const record = current;
	const part = parts[index];
	const isLast = index === parts.length - 1;
	const step = (key) => {
		if (isLast) assign(record, key, value);
		else applyPath(record[key], parts, index + 1, value);
	};
	if (Array.isArray(part)) {
		for (const key of part) step(key);
		return;
	}
	if (typeof part === "function") {
		if (!Array.isArray(current)) return;
		const filter = part;
		for (let i = 0; i < current.length; i++) if (filter(current[i], i)) step(i);
		return;
	}
	if (isRange(part)) {
		if (!Array.isArray(current)) return;
		const from = part.from ?? 0;
		const to = part.to ?? current.length - 1;
		const by = part.by ?? 1;
		for (let i = from; i <= to; i += by) step(i);
		return;
	}
	step(part);
}
Object.assign((...pathAndValue) => (state) => {
	if (pathAndValue.length === 0) return;
	const value = pathAndValue[pathAndValue.length - 1];
	const parts = pathAndValue.slice(0, -1);
	if (parts.length === 0) {
		if (value !== null && typeof value === "object") Object.assign(state, value);
		return;
	}
	applyPath(state, parts, 0, value);
}, { DELETE: STORE_DELETE });
/**
* Boundary primitives (Solid 2.0 parity).
*
* These are the DOM-free cores that the `<Loading>`, `<Errored>` and
* `<Reveal>` components are built on: each takes a content thunk and returns
* an accessor that yields either the content or the boundary's stand-in.
* Reach for them when authoring custom boundary components.
*/
/** Boundary-owned signals are written from inside computations by design */
var BOUNDARY_SIGNAL$1 = { ownedWrite: true };
/** Context key a Reveal group publishes for descendant Loading boundaries */
var REVEAL_COORD = Symbol("barq-reveal");
function createPendingCollector$1() {
	const pendingNodes = /* @__PURE__ */ new Set();
	const count = signal$1(0, BOUNDARY_SIGNAL$1);
	const handle = {
		add(node) {
			if (!pendingNodes.has(node)) {
				pendingNodes.add(node);
				count.set(pendingNodes.size);
			}
		},
		delete(node) {
			if (pendingNodes.delete(node)) count.set(pendingNodes.size);
		}
	};
	return {
		handle,
		count: () => count(),
		install(owner) {
			provideOn$1(owner, LOADING_BOUNDARY$1, handle);
		}
	};
}
function createErrorCollector$1() {
	const error = signal$1(void 0, BOUNDARY_SIGNAL$1);
	const failed = signal$1(false, BOUNDARY_SIGNAL$1);
	const capture = (err) => {
		error.set(err);
		failed.set(true);
	};
	return {
		error: () => error(),
		failed: () => failed(),
		capture,
		clear() {
			failed.set(false);
			error.set(void 0);
		},
		install(owner) {
			provideOn$1(owner, ERROR_BOUNDARY$1, capture);
		}
	};
}
/**
* Claim-based hydration. `CODESIGN.md` §3.11 and §12, `SEMANTICS.md` H1–H4, H6.
*
* The client CLAIMS the server's nodes by walking them. Nothing is cleared,
* nothing is replaced, and the walk that claims is the walk that would have
* built — `child`/`sib` replace `.firstChild`/`.nextSibling` under `hydratable`
* and address the same positions.
*
* THE WIRE FORMAT, which the compiler writes and this file reads:
*
*   <!--[-->  …  <!--]-->     a hole the client cannot bound on its own
*   <!--[--> … <!--]-->       a control-flow range
*   <!--[k--> …  <!--]-->     the same range in a DEV build, `k` the key the
*                             primitive CHOSE
*   <!--[b:N--> … <!--]-->    a boundary the stream has not flushed yet
*   <!---->                   a skeleton marker, present on both sides
*
* and, as important, what it does NOT carry:
*
*   a hole that owns its parent element's whole child list — no comments; the
*     extent is every child of the parent and the client reads it off the
*     document
*   a row of an `each` — no comments; the rows are built in order and each one
*     claims from the list's cursor, so its extent is what it consumed
*
* §12 REVERSED §11 Q4 on a measurement: the boundary comments cost 55.7% raw
* and 7.3% gzipped on a 100-row page, and 7.3% on every page forever is
* material. The split that replaces it is this: THE WIRE CARRIES WHAT RECOVERY
* NEEDS AND NOTHING ELSE, and DETECTION is an emission axis that a dev build
* turns on and a production build does not have. What is left above is
* load-bearing for the claim itself — a delimited hole's extent is data the
* client cannot compute, and a range's identity is a decision only the server
* made.
*
* Every claim below either succeeds or throws [`HydrationMismatch`], and every
* catcher is one of exactly two:
*
*  - a REGION catches it and rebuilds its own range — H4's local blast radius;
*  - `hydrate` catches it and does a full client render — today's behaviour,
*    exactly, which is the worst case this design admits.
*
* There is no third option and in particular no arm that swallows one.
*/
var ELEMENT$1 = 1;
var COMMENT$1 = 8;
var TEXT$1 = 3;
/**
* Thrown by every claim that cannot be satisfied. It is never caught by the
* code that raised it: a region catches its own, `hydrate` catches the rest.
*/
var HydrationMismatch$1 = class extends Error {
	kind;
	constructor(kind, detail) {
		super(`hydration mismatch (${kind}): ${detail}`);
		this.name = "HydrationMismatch";
		this.kind = kind;
	}
};
var SESSION$1 = null;
/** True while a claim is live. Every hot path tests this and nothing else. */
function hydrating$1() {
	return SESSION$1 !== null && SESSION$1.stack.length > 0;
}
/**
* Record a divergence that was RECOVERED rather than thrown.
*
* A text difference is the case: the server said one thing, the client another,
* and writing the client's value through the claimed text node keeps the node
* and fixes the content. It is still a divergence and still gets a row, because
* "nothing was reported" has to mean "nothing diverged".
*/
function report$1(kind, detail) {
	if (SESSION$1 !== null) SESSION$1.mismatches.push({
		kind,
		detail
	});
}
function beginHydration$1(container) {
	SESSION$1 = {
		container,
		marked: hasRanges$1(container),
		stack: [{
			parent: container,
			next: container.firstChild,
			end: null
		}],
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0
	};
}
/**
* Does this markup carry range comments?
*
* One scan, at the start, and it is what lets a construct with no flag tell its
* two situations apart. A module built without the flag over markup built
* without it is ORDINARY — nothing was ever going to be claimed there, and
* building cold is exactly right. The same module over markup built WITH it is a
* deployment mistake, and a bad one: the client's walk is native, so it steps
* onto a boundary comment and everything it addresses after that is off by an
* unknown amount. That is not recoverable locally and must not be treated as if
* it were.
*
* `true` proves the markup is hydratable; `false` proves nothing. §12 took the
* comments off every position whose extent the client can read off its parent,
* so a hydratable page can now carry none at all. The caller uses it to choose
* the wording of a diagnostic, which is all a one-way signal can carry.
*/
function wireIsMarked$1() {
	return SESSION$1 !== null && SESSION$1.marked;
}
/**
* Has the walk landed on claim scaffolding?
*
* A boundary comment is never a position the compiler addresses — it is the
* marker AROUND one — so a `(parent, anchor)` pair whose anchor is one means the
* walk that produced it counted the server's ranges as ordinary nodes. That is
* precisely what a client half built WITHOUT the flag does over markup built
* with it, and it means every index from here on is off by an unknown amount.
*
* Cheap, exact, and it does not depend on how deep the caller happens to be.
*/
function isScaffolding(node) {
	if (node === null || node.nodeType !== COMMENT$1) return false;
	const data = node.data;
	return data.charAt(0) === "[" || data === "]";
}
function hasRanges$1(root) {
	for (let node = root.firstChild; node !== null; node = node.nextSibling) {
		if (node.nodeType === COMMENT$1 && node.data.charAt(0) === "[") return true;
		if (node.nodeType === ELEMENT$1 && hasRanges$1(node)) return true;
	}
	return false;
}
function endHydration$1() {
	const session = SESSION$1;
	SESSION$1 = null;
	if (session === null) return {
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0
	};
	return {
		mismatches: session.mismatches,
		claimed: session.claimed,
		ranges: session.ranges,
		built: session.built
	};
}
/**
* Run `body` with the cursor suspended.
*
* A portal builds into a container the server never wrote at this position, and
* a rebuilt branch builds nodes nobody may claim. Both need the ordinary client
* path, and both are re-entrant with respect to the claim above them — hence a
* stack rather than a flag.
*/
function withoutClaim(body) {
	if (SESSION$1 === null) return body();
	const stack = SESSION$1.stack;
	SESSION$1.stack = [];
	try {
		return body();
	} finally {
		SESSION$1.stack = stack;
	}
}
/**
* A cursor over `range`'s interior that OUTLIVES one entry into it.
*
* The rows of an `each` are why it exists. A row used to be delimited on the
* wire so the client could hand row `i` its own nodes; it does not need to be,
* because the rows are built in ORDER and a row's extent is exactly what its
* build consumed. One cursor, shared by every row, is the whole mechanism —
* which is what let 1,600 bytes of the 100-row page's 6,416 go.
*/
function openCursor$1(range) {
	const parent = range.open?.parentNode ?? range.parent;
	return {
		parent,
		next: range.open === null ? parent.firstChild : range.open.nextSibling,
		end: range.close
	};
}
/** Run `body` claiming from `cursor`, which keeps whatever it consumed. */
function atCursor$1(cursor, body) {
	if (SESSION$1 === null) return body();
	SESSION$1.stack.push(cursor);
	try {
		return body();
	} finally {
		SESSION$1.stack.pop();
	}
}
/** Run `body` claiming from `range`'s interior, once. */
function withRange$1(range, body) {
	if (SESSION$1 === null) return body();
	return atCursor$1(openCursor$1(range), body);
}
/**
* Claim the next node at the cursor, which is what `template()` calls instead
* of cloning.
*
* `expect` is the template's own root node name. Comparing it is the cheapest
* structural check there is and it catches the case that matters: the client
* building a different tree from the one the server serialised. React's
* documented consequence of NOT catching it is event handlers attached to the
* wrong elements.
*/
function claimNode(template, detect) {
	if (SESSION$1 === null) return null;
	const cursor = SESSION$1.stack[SESSION$1.stack.length - 1];
	if (cursor === void 0) return null;
	const expect = template.nodeName;
	const node = cursor.next;
	if (node === null || node === cursor.end) throw new HydrationMismatch$1("structure", `the server's markup ran out where the client expected <${expect.toLowerCase()}>`);
	if (node.nodeName !== expect) throw new HydrationMismatch$1("structure", `the server wrote ${describe$1(node)} where the client builds <${expect.toLowerCase()}>`);
	if (detect === true) verifySubtree(template, node, expect.toLowerCase());
	cursor.next = node.nextSibling;
	SESSION$1.claimed++;
	return node;
}
/**
* THE DETECTION, and it runs only in a build that asked for it.
*
* Claiming one node claims everything under it — the walk below is `child`/`sib`
* over the server's own nodes — so if the server's subtree is not the template's
* shape, every index below this point addresses something else and the bindings
* land on the wrong elements. That is React's documented consequence of an
* undetected mismatch, and without this check it is exactly what an EXTRA
* element produces here: the walk indexes from both ends, so a node inserted in
* the middle is invisible to it and survives into the hydrated page.
*
* Ranges contribute nothing, which is what makes this comparable at all: the
* template has no node at a delimited hole and the server has a `<!--[-->` …
* `<!--]-->` there.
*
* STATIC TEXT is compared as well as node names, and that is the compensation
* §12 owes: an undelimited hole no longer leaves a `<!--]-->` for `claimRange`
* to assert against, and two branch arms that differ only in the words they
* print are structurally identical. Text that came out of a HOLE is inside a
* range and is skipped; text that is here is template bytes on both sides, from
* one compiler and one escaper, so a difference is a real divergence and not a
* normalisation artefact.
*
* O(subtree) per claim — which is exactly why the production build does not
* call it. §12: silent failure is the dominant harm IN DEVELOPMENT, and this is
* where it is answered.
*/
function verifySubtree(want, have, path) {
	const wanted = want.childNodes;
	if (wanted.length === 0) return;
	let i = 0;
	let depth = 0;
	for (let node = have.firstChild; node !== null; node = node.nextSibling) {
		if (node.nodeType === COMMENT$1) {
			const data = node.data;
			if (data.charAt(0) === "[") {
				depth++;
				continue;
			}
			if (data === "]") {
				if (depth === 0) throw new HydrationMismatch$1("range", "a range closed that never opened");
				depth--;
				continue;
			}
		}
		if (depth > 0) continue;
		const a = wanted[i];
		if (a === void 0) throw new HydrationMismatch$1("structure", `<${path}> has more nodes than the client's template — the server wrote ${describe$1(node)} where the template ends`);
		if (a.nodeName !== node.nodeName) throw new HydrationMismatch$1("structure", `at ${path} child ${i}: the server wrote ${describe$1(node)} where the client builds ` + a.nodeName.toLowerCase());
		if (node.nodeType === TEXT$1 && a.data !== node.data) throw new HydrationMismatch$1("text", `at ${path} child ${i}: the server wrote ${JSON.stringify(node.data)} where the client's template has ${JSON.stringify(a.data)}`);
		verifySubtree(a, node, `${path} > ${a.nodeName.toLowerCase()}`);
		i++;
	}
	if (depth !== 0) throw new HydrationMismatch$1("range", `${depth} range(s) opened and never closed`);
	if (i !== wanted.length) throw new HydrationMismatch$1("structure", `<${path}> has ${i} node(s) where the client's template has ${wanted.length} — the server's tree is not the one this walk addresses`);
}
/** A node the client had to build because no claim was possible. */
function built() {
	if (SESSION$1 !== null) SESSION$1.built++;
}
function describe$1(node) {
	if (node.nodeType === COMMENT$1) return `<!--${node.data}-->`;
	if (node.nodeType === TEXT$1) return `the text ${JSON.stringify(node.data)}`;
	return `<${node.nodeName.toLowerCase()}>`;
}
/**
* The range the server wrote at `(parent, anchor)` — the same pair the compiler
* handed `insert` and the four primitives.
*
* A position's content ends immediately before its anchor, so the anchor's
* previous sibling is that position's `<!--]-->`; with no anchor the position is
* the last thing in its parent and the parent's last child is. Nothing searches:
* if the comment is not exactly there, the client is not looking at the tree the
* server serialised and says so.
*
* `mode` is the compiler's `WHOLE`, and it is the §12 half: a hole that owns its
* parent's child list was written with no comments at all.
*/
function claimRange$1(parent, anchor, mode) {
	const host = anchor !== null ? anchor.parentNode : parent;
	if (host === null) throw new HydrationMismatch$1("range", "a claim at a position with no parent");
	if (SESSION$1 === null || !SESSION$1.container.contains(host)) return null;
	if (mode === 16) {
		const nodes = [];
		for (let node = host.firstChild; node !== null; node = node.nextSibling) nodes.push(node);
		SESSION$1.ranges++;
		return {
			open: null,
			close: null,
			parent: host,
			nodes
		};
	}
	const close = anchor !== null ? anchor.previousSibling : host.lastChild;
	if (close === null || close.nodeType !== COMMENT$1 || close.data !== "]") throw new HydrationMismatch$1("range", `expected <!--]--> before ${anchor === null ? "the end of " : ""}<${host.nodeName.toLowerCase()}>, found ${close === null ? "nothing" : describe$1(close)}`);
	let depth = 0;
	const nodes = [];
	for (let node = close.previousSibling; node !== null; node = node.previousSibling) {
		if (node.nodeType === COMMENT$1) {
			const data = node.data;
			if (data === "]") depth++;
			else if (data.charAt(0) === "[") {
				if (depth === 0) {
					nodes.reverse();
					SESSION$1.ranges++;
					return {
						open: node,
						close,
						parent: host,
						nodes
					};
				}
				depth--;
			}
		}
		nodes.push(node);
	}
	throw new HydrationMismatch$1("range", "a <!--]--> whose <!--[--> is not in the same parent");
}
/**
* `claimRange`, plus the one position that has no `(parent, anchor)` to claim
* against: a region that IS a unit root. The compiler hands those `(null, null)`
* — there is no template around them to walk — so the range is the next thing at
* the cursor, exactly as a `template()` call there would claim the next node.
*/
function claimAt(parent, anchor, mode) {
	if (parent !== null || anchor !== null) return claimRange$1(parent, anchor, mode);
	if (SESSION$1 === null) throw new HydrationMismatch$1("range", "a claim outside a hydration");
	const cursor = SESSION$1.stack[SESSION$1.stack.length - 1];
	if (cursor === void 0) throw new HydrationMismatch$1("range", "a claim with no cursor");
	const open = cursor.next;
	if (open === null || open === cursor.end || open.nodeType !== COMMENT$1 || open.data.charAt(0) !== "[") throw new HydrationMismatch$1("range", `expected <!--[--> at a root region, found ${open === null ? "nothing" : describe$1(open)}`);
	let depth = 0;
	const nodes = [];
	for (let node = open.nextSibling; node !== null; node = node.nextSibling) {
		if (node.nodeType === COMMENT$1) {
			const data = node.data;
			if (data.charAt(0) === "[") depth++;
			else if (data === "]") {
				if (depth === 0) {
					cursor.next = node.nextSibling;
					SESSION$1.ranges++;
					return {
						open,
						close: node,
						parent: cursor.parent,
						nodes
					};
				}
				depth--;
			}
		}
		nodes.push(node);
	}
	throw new HydrationMismatch$1("range", "a <!--[--> at a root region that never closed");
}
/**
* `claimAt`, asking rather than requiring: `null` where a claim would have
* thrown.
*
* The one legitimate third answer, and it is a question rather than a claim —
* "did the server write a range at this position?" — asked by a construct that
* has already decided to build cold and only wants to know whether there is
* something to take away first. A `try`/`catch` around `claimAt` would be the
* arm that swallows a mismatch, which this file does not have; this is a
* separate entry point that does not raise one.
*/
function probeRange(parent, anchor) {
	try {
		return claimAt(parent, anchor);
	} catch (error) {
		if (error instanceof HydrationMismatch$1) return null;
		throw error;
	}
}
/**
* The key the server wrote in `<!--[k-->`, or `null` when it wrote none.
*
* `null` is the ordinary answer in a PRODUCTION build: §12 moved the key onto
* the detection axis, so a production range is `<!--[-->` and the client claims
* it positionally — which is exactly what a hole has always had, and what a key
* with no safe comment spelling has always fallen back to.
*/
function rangeKey(range) {
	const data = range.open?.data;
	return data !== void 0 && data.length > 1 ? data.slice(1) : null;
}
/**
* Give a claimed range back: the nodes go, the boundary comments stay.
*
* This is H4's recovery. The comments stay because the CLOSE is the anchor the
* rebuilt content inserts before — throwing it away would make the position
* unaddressable for every later update, which is the difference between "that
* branch re-rendered" and "the page is now built on a different skeleton". An
* undelimited range has no comments to keep and needs none: its anchor is the
* end of its parent, which nothing can take away.
*/
function releaseRange(range) {
	for (const node of range.nodes) node.parentNode?.removeChild(node);
	range.nodes.length = 0;
}
/**
* Type-safe assertion and guard utilities
* Use these instead of raw `as` assertions throughout the codebase
*/
function isString(value) {
	return typeof value === "string";
}
function isNumber(value) {
	return typeof value === "number";
}
function isBoolean(value) {
	return typeof value === "boolean";
}
function isSignalGetter(value) {
	return typeof value === "function";
}
function isObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isArray$1(value) {
	return Array.isArray(value);
}
function isNullish(value) {
	return value === null || value === void 0;
}
/**
* Safely convert a value to string (for DOM attributes)
* Handles string, number, and stringifiable values
*/
function toString(value) {
	if (isString(value)) return value;
	if (isNumber(value)) return String(value);
	if (isBoolean(value)) return value ? "true" : "false";
	if (isBlock$1(value)) throw new ScopeMissingError$1("a Block reached a text or attribute position, where its own source text would be written into the document (C5.1). Render it as a child, or hand the position a Cell");
	return String(value);
}
/**
* DOM rendering and reconciliation
* Fine-grained reactive DOM updates using comment markers
*/
var SVG_NS = "http://www.w3.org/2000/svg";
new Set(Object.keys({
	"input:value": 1,
	"textarea:value": 1,
	"select:value": 1,
	"input:checked": 1,
	"input:indeterminate": 1,
	"option:selected": 1,
	"details:open": 1,
	"dialog:open": 1,
	"audio:currentTime": 1,
	"video:currentTime": 1,
	"audio:volume": 1,
	"video:volume": 1,
	"*:scrollTop": 1,
	"*:scrollLeft": 1
}).map((k) => k.slice(k.indexOf(":") + 1)));
/**
* E2 entry point #6. A handler is code the framework invoked, so the framework
* owns its failure: the throw routes to the nearest `ERROR_BOUNDARY` on the
* owning scope's chain instead of escaping to `window.onerror`. With no boundary
* above it the error is rethrown, which is what it did before.
*
* `NotReadyError` is re-thrown by the boundary's own handler (E2.3), so it
* passes through here without a second test.
*/
function routeError(scope, error) {
	const routed = scope === null ? CONTEXT_MISS$1 : lookupContext$1(scope, ERROR_BOUNDARY$1);
	if (routed !== CONTEXT_MISS$1 && typeof routed === "function") {
		routed(error);
		return;
	}
	throw error;
}
/** `setAttribute` / `removeAttribute`. A boolean value toggles the attribute. */
function setAttr(element, name, value, prev) {
	if (value === prev) return prev;
	if (isBoolean(value)) {
		if (value) element.setAttribute(name, "");
		else element.removeAttribute(name);
		return value;
	}
	if (isNullish(value)) {
		element.removeAttribute(name);
		return value;
	}
	element.setAttribute(name, toString(value));
	return value;
}
/**
* The `class` channel, normalised from a string, array or object — and it emits
* only the tokens it OWNS.
*
* `element.className = …` owns the whole attribute, so every class another
* channel put there — `classList`, a `ref`, a directive — is erased the moment
* this value changes. B1/B2 remove that in two places, and they cover different
* cases: the fused record guards `class` on its own field, so an UNRELATED prop
* can no longer reach this channel at all, and the branch below keeps a real
* class change from taking anything it did not write.
*
* The test is one string compare: if the attribute still reads exactly what this
* channel last applied, nothing else is holding a token and the value is written
* WHOLE — byte for byte, which is what keeps a class string round-tripping
* through the DOM unchanged (duplicate tokens, runs of spaces, and separators
* `DOMTokenList` does not treat as whitespace all survive). Only when the
* attribute has been changed by someone else does the write become a token diff,
* and only that case pays for one.
*
* A ONE-SHOT caller — `setProp`, the un-compiled walk, anything that does not
* thread `prev` — has no `prev` to compare against, and reading `null` for it
* made every write after the first an additive diff that removed nothing:
* twenty thousand `setProp(el, "class", …)` calls left twenty thousand tokens on
* the element. The channel therefore remembers its own last write on the element
* (`$$class`, beside `$$s`), which is what "what this channel last applied"
* means when the caller cannot say. It still removes only what it OWNS, so a
* token another channel put there survives.
*/
function setClass(element, _name, value, prev) {
	const className = classToString(value);
	if (className === prev) return prev;
	const held = element;
	const owned = prev === void 0 ? held.$$class ?? null : prev;
	const current = element.getAttribute("class");
	held.$$class = className;
	if (current === owned) {
		if (className === null) element.removeAttribute("class");
		else if (element.namespaceURI === SVG_NS) element.setAttribute("class", className);
		else element.className = className;
		return className;
	}
	const tokens = element.classList;
	const next = splitClass(className);
	for (const token of splitClass(owned)) if (!next.has(token)) tokens.remove(token);
	for (const token of next) tokens.add(token);
	if (className === null && tokens.length === 0) element.removeAttribute("class");
	return className;
}
function splitClass(value) {
	const out = /* @__PURE__ */ new Set();
	if (value === null) return out;
	for (const token of value.split(/[ \t\n\f\r]+/)) if (token !== "") out.add(token);
	return out;
}
/**
* §3.0 rule 3 at the `ref` slot. `block`'s entry guard fires on
* `scope === undefined`, and this is one of the two slots where the value is
* invoked with something ELSE — the Element — so the guard is structurally
* unreachable and a forwarded Block would run with a DOM node as its scope.
* `requireScope` accepts it, everything below it is parented to that node, and
* root disposal never reaches any of it. The brand is a property of the VALUE
* (C3.8), so the test belongs here, at the read, exactly as `readSlot` puts it.
*/
function refuseBlock(target, origin) {
	if (isBlock$1(target)) throw new ScopeMissingError$1(`${origin} (a Block reached a Cell slot)`);
}
/**
* B4 — a listener dies with its position. `addEventListener` paired with a
* cleanup on the scope the element belongs to, so removal costs no bookkeeping
* and cannot be forgotten. A handler that throws routes to the boundary (E2 #6).
*
* The delegated set never reaches here: those are `$$<type>` expandos plus one
* `delegateEvents` call per module, and that protocol is unchanged.
*/
function listen(s, element, type, handler, options) {
	const owner = requireScope$1(s, "listen");
	refuseBlock(handler, `on${type}`);
	const routed = routedListener(owner, element, handler);
	element.addEventListener(type, routed, options);
	if (owner === null) return;
	underScope$1(owner, "listen", () => {
		onCleanup(() => element.removeEventListener(type, routed, options));
	});
}
/**
* E2.2's half of `listen`, shared so the two non-delegated channels cannot
* drift: `spread` binds its own listeners and used to bind them RAW, so a throw
* out of one escaped `dispatchEvent` to `window.onerror` instead of reaching
* the enclosing boundary.
*/
function routedListener(owner, element, handler) {
	return function(e) {
		try {
			ownedBy$1(owner, "handler", () => {
				refuseBlock(handler.call(element, e), `on${e.type} (a Cell yielded a Block)`);
			});
		} catch (error) {
			routeError(owner, error);
		}
	};
}
/**
* The one question channel resolution CANNOT answer at compile time (§3.13):
* whether the value that arrived is a live Cell. The CHANNEL is the compiler's,
* passed in; only liveness is decided here.
*/
function bindProp(s, element, write, name, value) {
	const given = requireScope$1(s, "setProp");
	if (isBlock$1(value)) throw new ScopeMissingError$1(`setProp ${name} (a Block reached a Cell slot)`);
	if (!isSignalGetter(value)) {
		write(element, name, value, void 0);
		return;
	}
	ownedBy$1(given, "setProp", () => {
		let prev;
		renderEffect$1(() => readSlot(value, `setProp ${name}`), (next) => {
			prev = write(element, name, next, prev);
		});
	});
}
/** Normalize a class value (string, array, or object) to a string or null */
function classToString(value) {
	if (isNullish(value) || value === false) return null;
	if (isString(value)) return value;
	if (isArray$1(value)) return value.filter(Boolean).join(" ");
	if (isObject(value)) {
		let className = "";
		for (const k in value) if (value[k]) className += (className ? " " : "") + k;
		return className;
	}
	return null;
}
/**
* Brand carried by every value the compiler's SSR string mode produces. A
* module that fell back to this DOM backend (DESIGN §5's eight non-inlinable
* flow components) can still render a component compiled to strings, and
* without this it would insert the markup as escaped text.
*
* A REGISTERED SYMBOL, and that is the security property: this brand decides
* whether a value is written as markup or escaped as text, so a shape
* `JSON.parse` can produce would make every deserialised object an injection
* point. `Symbol.for` is unreachable from JSON and still identical across two
* copies of this module, which the `.` and `./server` entries really are.
*/
var SSR_HTML_BRAND$1 = Symbol.for("barq.ssr.html");
function isSsrHtml$1(value) {
	return typeof value === "object" && value !== null && value[SSR_HTML_BRAND$1] === true && typeof value.t === "string";
}
function ssrHtmlNodes$1(value) {
	const holder = document.createElement("template");
	holder.innerHTML = value.t;
	return Array.from(holder.content.childNodes);
}
/**
* Reading a fragment's children is destructive: whoever reads them inserts
* them, which MOVES them out, so a second read of the same eager
* `children`/`fallback` finds an empty fragment and the content is gone for
* good. Remembering the drained list is what makes a multi-node body survive a
* hide/show cycle — and target #8 hands the runtime eager bodies as a matter of
* course, so this is the ordinary path rather than an edge of it.
*/
var drainedFragments$1 = /* @__PURE__ */ new WeakMap();
function drainFragment$1(fragment) {
	if (fragment.firstChild === null) {
		const remembered = drainedFragments$1.get(fragment);
		return remembered === void 0 ? [] : remembered.slice();
	}
	const nodes = [];
	while (fragment.firstChild) {
		nodes.push(fragment.firstChild);
		fragment.removeChild(fragment.firstChild);
	}
	drainedFragments$1.set(fragment, nodes);
	return nodes.slice();
}
/**
* Flatten a child value to nodes, reusing previous text nodes positionally
* when their content matches (avoids re-creating text per update).
*/
function normalizeChildToNodes$1(value, prev, s) {
	const out = [];
	const visit = (child) => {
		if (child === null || child === void 0 || typeof child === "boolean") return;
		if (child instanceof DocumentFragment) {
			for (const node of drainFragment$1(child)) out.push(node);
			return;
		}
		if (child instanceof Node) {
			out.push(child);
			return;
		}
		if (isSsrHtml$1(child)) {
			for (const node of ssrHtmlNodes$1(child)) out.push(node);
			return;
		}
		if (typeof child === "function") {
			visit(child(s));
			return;
		}
		if (Array.isArray(child)) {
			for (let i = 0; i < child.length; i++) visit(child[i]);
			return;
		}
		const text = String(child);
		const candidate = prev[out.length];
		if (candidate && candidate.nodeType === 3 && candidate.data === text) out.push(candidate);
		else out.push(document.createTextNode(text));
	};
	visit(value);
	return out;
}
/**
* Reconcile two node arrays in place (udomdiff: common prefix/suffix,
* swap shortcut, lazy Map fallback). Keys are node identities - exactly
* right for fine-grained rendering where rows keep their DOM nodes.
* Adapted from https://github.com/WebReflection/udomdiff
*/
function reconcileNodeArrays$1(parent, a, b, after) {
	const bLength = b.length;
	let aEnd = a.length;
	let bEnd = bLength;
	let aStart = 0;
	let bStart = 0;
	let map = null;
	while (aStart < aEnd || bStart < bEnd) {
		if (a[aStart] === b[bStart]) {
			aStart++;
			bStart++;
			continue;
		}
		while (a[aEnd - 1] === b[bEnd - 1]) {
			aEnd--;
			bEnd--;
		}
		if (aEnd === aStart) {
			const anchor = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
			while (bStart < bEnd) parent.insertBefore(b[bStart++], anchor);
		} else if (bEnd === bStart) while (aStart < aEnd) {
			if (!map || !map.has(a[aStart])) a[aStart].remove();
			aStart++;
		}
		else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
			const node = a[--aEnd].nextSibling;
			parent.insertBefore(b[bStart++], a[aStart++].nextSibling);
			parent.insertBefore(b[--bEnd], node);
			a[aEnd] = b[bEnd];
		} else {
			if (!map) {
				map = /* @__PURE__ */ new Map();
				for (let i = bStart; i < bEnd; i++) map.set(b[i], i);
			}
			const index = map.get(a[aStart]);
			if (index === void 0) a[aStart++].remove();
			else if (index < bStart || index >= bEnd) aStart++;
			else {
				let sequence = 1;
				let t;
				while (aStart + sequence < aEnd && (t = map.get(a[aStart + sequence])) !== void 0 && t === index + sequence) sequence++;
				if (sequence > index - bStart) {
					const node = a[aStart];
					while (bStart < index) parent.insertBefore(b[bStart++], node);
				} else parent.replaceChild(b[bStart++], a[aStart++]);
			}
		}
	}
}
var EMPTY_NODES$1 = [];
/**
* Removal, in ONE DOM call when the run being removed is every child its parent
* has.
*
* `clear rows` at 1,000 rows is 1,000 `removeChild` calls where Solid issues a
* single `textContent = ""`, and in a real Chrome that per-node loop is the
* dominant term of the whole benchmark: 2.85 ms of the 3.95 ms of JS, against
* Solid's 2.56 ms for the one call. Each `removeChild` re-checks mutation
* observers, invalidates style and detaches a layout object on its own; the
* bulk write does that work once for the parent.
*
* The guard is EXACT, not a heuristic, because being wrong here deletes markup
* this hole does not own. Counting is not enough on its own — a run whose nodes
* were moved out from under this parent (a `portal`, a directive) could match
* the count while naming different nodes — so membership is verified as well.
* That is one `parentNode` read per node against a `removeChild` per node, and
* the reads do not touch layout.
*/
function removeNodes$1(nodes) {
	const count = nodes.length;
	if (count === 0) return;
	const host = nodes[0].parentNode;
	if (host !== null && count === host.childNodes.length && allUnder$1(host, nodes)) {
		host.textContent = "";
		return;
	}
	for (let i = 0; i < count; i++) nodes[i].parentNode?.removeChild(nodes[i]);
}
function allUnder$1(host, nodes) {
	for (let i = 0; i < nodes.length; i++) if (nodes[i].parentNode !== host) return false;
	return true;
}
/**
* Apply `value` into `parent`, replacing whatever this hole rendered last time
* (`current`), anchored before `marker` (null = end of parent). Returns the
* nodes the hole now owns.
*
* A hole tracks its own nodes instead of fencing them with comment markers, so
* it costs the nodes it actually renders: a lone text hole is one text node,
* not a text node between two comments.
*/
function applyInsert$1(parent, value, current, marker, s) {
	if (typeof value === "string" || typeof value === "number") {
		if (current.length === 1 && current[0].nodeType === 3) {
			current[0].data = String(value);
			return current;
		}
		if (marker === null && current.length === 0 && parent.firstChild === null) {
			parent.textContent = String(value);
			const node = parent.firstChild;
			return node === null ? EMPTY_NODES$1 : [node];
		}
	}
	const next = normalizeChildToNodes$1(value, current, s);
	if (current.length === 0) {
		for (let i = 0; i < next.length; i++) parent.insertBefore(next[i], marker);
		return next;
	}
	if (next.length === 0) {
		removeNodes$1(current);
		return EMPTY_NODES$1;
	}
	reconcileNodeArrays$1(current[0].parentNode ?? parent, current, next, marker);
	return next;
}
/**
* Run `build` with `given` as `CURRENT`, so everything it creates is owned by
* the scope the call was HANDED rather than by whatever the call site left
* current. That is O4.5, and it is what the four flow primitives already do.
*
* `null` is left alone deliberately. `requireScope` admits it — the compiler
* emits `const _s$ = null` for a module-level root — and it names NO owner, so
* there is nothing for the argument to win. Forcing `CURRENT` to null there
* turns the effect into an ORPHAN, which `enterRoot` then CLAIMS: ownership
* would be RELOCATED rather than decided, and relocating it is the M2 bridge
* O5's registry row is about. Measured, not assumed — doing it unconditionally
* makes `render(<Tree/>, host)` stop emitting RENDER_SUBTREE_NOT_OWNED, because
* the root ends up holding the argument's effects after all. That belongs to
* O5's milestone, with the fixture re-cut in the same change.
*/
function ownedBy$1(given, origin, build) {
	if (given === null) {
		build();
		return;
	}
	underScope$1(given, origin, build);
}
/**
* Insert a child into `parent` before `marker` (or append when absent), under
* the scope the enclosing Block was given. CODESIGN §3.3 C6: scope FIRST.
*
* Taking it as an argument is what makes §3.0 rule 3 enforceable at no cost. A
* compiled Block that builds anything reaches here, so a Block invoked with no
* scope throws where it was mistimed rather than silently constructing under
* whatever happened to be current — and the ownership trace gets a `given` that
* was threaded rather than read back off `CURRENT`, which is the one comparison
* that cannot fail.
*/
function insert$1(s, parent, value, marker, mode) {
	const given = requireScope$1(s, "insert");
	let anchor = marker ?? null;
	if (isArray$1(value) && value.some(holdsAFunction$1)) {
		insert$1(s, parent, () => value, marker, mode);
		return;
	}
	const claim = hydrating$1() ? claimRange$1(parent, anchor, mode) : null;
	if (claim !== null && claim.close !== null) anchor = claim.close;
	if (typeof value === "function") {
		let current = claim === null ? EMPTY_NODES$1 : claim.nodes;
		let first = claim;
		ownedBy$1(given, "insert", () => {
			renderEffect$1(() => {
				const owner = getOwner$1();
				if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockEnter("insert", given);
				const claiming = first;
				first = null;
				const produced = claiming === null ? value(owner) : withRange$1(claiming, () => value(owner));
				if (claiming !== null) detectTextDrift$1(current, produced);
				current = applyInsert$1(parent, produced, current, anchor, given);
				if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockExit("insert");
			});
		});
		return;
	}
	if (value === null || value === void 0 || value === true || value === false) return;
	if (claim !== null) {
		detectTextDrift$1(claim.nodes, value);
		applyInsert$1(parent, value, claim.nodes, anchor, given);
		return;
	}
	if (value instanceof Node) parent.insertBefore(value, anchor);
	else if (isSsrHtml$1(value)) for (const node of ssrHtmlNodes$1(value)) parent.insertBefore(node, anchor);
	else if (Array.isArray(value)) {
		const nodes = childToNodes$1(value, given);
		for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], anchor);
	} else {
		const text = String(value);
		if (anchor === null && text !== "" && parent.firstChild === null) {
			parent.textContent = text;
			return;
		}
		parent.insertBefore(document.createTextNode(text), anchor);
	}
}
/**
* A hole whose server text and client text differ.
*
* This is the divergence that RECOVERS: `applyInsert` writes the client's value
* through the claimed text node, so the node survives and the content is right.
* It still gets a row, because the point of the whole scheme is that "no
* mismatch was reported" means something — a timestamp rendered on the server
* and re-rendered on the client is the textbook case, and a framework that
* cannot name it is the framework that cannot name any of them.
*/
function detectTextDrift$1(claimed, produced) {
	if (typeof produced !== "string" && typeof produced !== "number") return;
	const want = String(produced);
	const have = claimed.length === 0 ? "" : claimed.length === 1 && claimed[0].nodeType === 3 ? claimed[0].data : null;
	if (have === want) return;
	report$1("text", have === null ? `the server wrote ${claimed.length} nodes where the client renders the text ${JSON.stringify(want)}` : `the server wrote ${JSON.stringify(have)} where the client renders ${JSON.stringify(want)}`);
}
/**
* Convert a Child to an array of Nodes, under the scope this construction was
* handed. `s` is threaded from `insert`'s parameter, never read back off the
* ambient owner.
*/
/**
* Whether a child value holds a function anywhere inside it — the test that
* decides whether an array is a LIVE hole. Recursive, because a nested array is
* flattened into the same range and a function two levels down is as live as
* one at the top.
*/
function holdsAFunction$1(child) {
	if (typeof child === "function") return true;
	return isArray$1(child) && child.some(holdsAFunction$1);
}
function childToNodes$1(child, s = getOwner$1()) {
	if (child === null || child === void 0 || child === true || child === false) return [];
	if (child instanceof DocumentFragment) return drainFragment$1(child);
	if (child instanceof Node) return [child];
	if (isSsrHtml$1(child)) return ssrHtmlNodes$1(child);
	if (typeof child === "function") {
		if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockEnter("children", s);
		const built = child(s);
		if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.blockExit("children");
		return childToNodes$1(built, s);
	}
	if (Array.isArray(child)) {
		const nodes = [];
		for (let i = 0; i < child.length; i++) {
			const childNodes = childToNodes$1(child[i], s);
			for (let j = 0; j < childNodes.length; j++) nodes.push(childNodes[j]);
		}
		return nodes;
	}
	return [document.createTextNode(String(child))];
}
/**
* O5: open a root scope, build under it, insert, flush, and return a disposer
* that disposes the scope AND removes its range.
*
* `block` is the O5 shape: `(s: Scope) => Out`, invoked with the root, and it
* is the only form under which O5 holds unconditionally.
*
* **The already-built form and its precondition.** `render(<Tree/>, host)`
* constructs the subtree as an ARGUMENT, before `render` is entered. With no
* ambient owner at the call site its effects are created with `CURRENT` null,
* and `enterRoot` claims them (`adoptOrphans`), so the disposer disposes. With
* an ambient owner they are that owner's kids at the instant they are created,
* and no code running after the call can tell them from anything else that
* owner holds — the watermark would have to have been taken before the
* argument was evaluated. Ownership is not lost, it is RELOCATED: disposing
* the ambient owner disposes the subtree. But this disposer cannot, so it says
* so rather than pretending. M3's calling convention removes the form.
*
* **The claim is the eager form's alone.** The orphan list is bounded by TIME,
* not by provenance, so claiming it from the Block form would let this mount's
* disposer stop a library's ownerless effect that merely happened to be created
* in the same turn. Pinned by `sem-own-render-disposer-disposes`.
*/
function render(block, container) {
	container.textContent = "";
	const eager = typeof block !== "function";
	const ambient = eager ? getOwner$1() : null;
	const root = enterRoot$1(eager);
	if (ambient !== null && root.kids === null) emitDiagnostic("RENDER_SUBTREE_NOT_OWNED", "warning", "render() was given an already-built subtree while an owner was current, so that owner owns it and this disposer will only remove the range. Pass a function — render((scope) => <App/>, host) — to have the root own what it mounts.");
	let element;
	try {
		element = typeof block === "function" ? block(root) : block;
		insertRendered$1(root, element, container);
	} finally {
		exit$1(root);
	}
	ownRange$1(root, () => {
		container.textContent = "";
	});
	flush$1();
	return () => {
		disposeScope$1(root);
	};
}
function insertRendered$1(scope, element, container) {
	if (element === null || element === void 0 || typeof element === "boolean") return;
	if (element instanceof Node) {
		if (element.parentNode !== container) container.appendChild(element);
		return;
	}
	if (typeof element === "function") {
		insert$1(scope, container, element);
		return;
	}
	if (isSsrHtml$1(element)) {
		for (const node of ssrHtmlNodes$1(element)) container.appendChild(node);
		return;
	}
	if (Array.isArray(element)) {
		for (const child of element) {
			const nodes = childToNodes$1(child, scope);
			for (const node of nodes) container.appendChild(node);
		}
		return;
	}
	container.appendChild(document.createTextNode(String(element)));
}
/** The node a capture record points at, resolved through the claimed tree. */
function atPath$1(path) {
	let node = document.body;
	for (const index of path) {
		if (node === null) return null;
		node = node.childNodes[index] ?? null;
	}
	return node;
}
/**
* Replay what the user did before the bundle arrived.
*
* Claiming is what makes this possible at all. The old capture was
* COORDINATE-based and pointer-only, and `server.ts` said why: the nodes get
* replaced, so there is no node to aim a key event at and no input to put a
* value back into. With the nodes preserved, a child-index path resolves to the
* SAME element it was recorded against, so the three things a user can be in
* the middle of — a value they typed, where the caret is, and which element has
* focus — are restorable, and the events replay against real targets.
*
* Order matters and is the recorded order: state first (so a handler that reads
* `event.target.value` sees what the user typed), then the events.
*/
function replayCapturedEvents$1() {
	const g = globalThis;
	g.__BARQ_EVTS_STOP__?.();
	const queue = g.__BARQ_EVTS__;
	g.__BARQ_EVTS__ = void 0;
	g.__BARQ_EVTS_STOP__ = void 0;
	if (!queue || queue.length === 0) return;
	for (const rec of queue) {
		if (rec.type !== "@state" || rec.path === void 0) continue;
		const target = atPath$1(rec.path);
		if (target === null) continue;
		if (rec.value !== void 0) target.value = rec.value;
		if (rec.checked !== void 0) target.checked = rec.checked;
		if (rec.focus === true && typeof target.focus === "function") target.focus();
		if (rec.start !== void 0 && typeof target.setSelectionRange === "function") try {
			target.setSelectionRange(rec.start, rec.end ?? rec.start);
		} catch {}
	}
	for (const rec of queue) {
		if (rec.type === "@state") continue;
		const path = rec.path;
		const target = (path !== void 0 && path.length > 0 ? atPath$1(path) : null) ?? pointAt$1(rec);
		if (target === null) continue;
		target.dispatchEvent(eventFor$1(rec));
	}
	flush$1();
}
function pointAt$1(rec) {
	if (rec.x === void 0 || rec.y === void 0) return null;
	if (typeof document.elementFromPoint !== "function") return null;
	return document.elementFromPoint(rec.x, rec.y);
}
var KEYBOARD$1 = /* @__PURE__ */ new Set([
	"keydown",
	"keyup",
	"keypress"
]);
function eventFor$1(rec) {
	if (KEYBOARD$1.has(rec.type)) return new KeyboardEvent(rec.type, {
		bubbles: true,
		cancelable: true,
		key: rec.key ?? "",
		code: rec.code ?? "",
		ctrlKey: rec.ctrlKey,
		metaKey: rec.metaKey,
		shiftKey: rec.shiftKey,
		altKey: rec.altKey
	});
	if (rec.type === "input" || rec.type === "change") return new Event(rec.type, {
		bubbles: true,
		cancelable: true
	});
	return new MouseEvent(rec.type, {
		bubbles: true,
		cancelable: true,
		clientX: rec.x ?? 0,
		clientY: rec.y ?? 0,
		button: rec.button ?? 0,
		ctrlKey: rec.ctrlKey,
		metaKey: rec.metaKey,
		shiftKey: rec.shiftKey,
		altKey: rec.altKey,
		view: typeof window === "undefined" ? void 0 : window
	});
}
/**
* Claim-based hydration (`SEMANTICS.md` H1–H4, H6).
*
* The container is NOT cleared. The compiled walk claims the server's nodes as
* it goes, and the only two outcomes are the claim succeeding or a
* `HydrationMismatch` reaching here — in which case the container is cleared
* and the page is rendered cold, which is exactly the behaviour this replaces.
* "Detectably incorrect, degrading to today" is the bar M6 was given, and the
* `recovered` row on the report is where it is read off.
*
* `fn` runs under a root, mirroring the one `renderToString` and `renderPage`
* put around theirs: without it the client's owner tree is a level shallower
* than the server's, and `computed`'s auto-keys — which are owner-tree ids —
* address different values on the two sides.
*/
function hydrate$1(fn, container, options) {
	hydrate$1.report = {
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0,
		recovered: false
	};
	if (options?.data) {
		const target = globalThis;
		target.__BARQ_DATA__ = {
			...target.__BARQ_DATA__,
			...options.data
		};
	}
	let clear = null;
	let failure = null;
	const served = container.firstChild !== null;
	const seeds = { ...globalThis.__BARQ_DATA__ };
	beginHydration$1(container);
	const marked = wireIsMarked$1();
	try {
		clear = mount$1(fn, container, true);
	} catch (error) {
		if (!(error instanceof HydrationMismatch$1)) {
			endHydration$1();
			throw error;
		}
		failure = error;
	}
	const claimReport = endHydration$1();
	if (failure === null && served && claimReport.claimed === 0 && claimReport.ranges === 0) failure = new HydrationMismatch$1("not-hydratable", marked ? "the container held markup with range comments and the render claimed none of it — the CLIENT module was not compiled with `hydratable`" : "the container held server markup the render claimed none of it, and there are no range comments to say which half is at fault — since `CODESIGN.md` §12 a page whose every position owns its element writes none, so this is either half compiled without `hydratable`");
	if (failure !== null) {
		clear?.();
		globalThis.__BARQ_DATA__ = seeds;
		resetChildIds$1();
		clear = mount$1(fn, container, false);
		hydrate$1.report = {
			mismatches: [...claimReport.mismatches, {
				kind: failure.kind,
				detail: failure.message
			}],
			claimed: claimReport.claimed,
			ranges: claimReport.ranges,
			built: claimReport.built,
			recovered: true
		};
		emitDiagnostic("HYDRATION_MISMATCH", "warning", `${failure.message} — the server's markup was discarded and the page rendered on the client.`);
	} else hydrate$1.report = {
		...claimReport,
		recovered: false
	};
	flush$1();
	unclaimedSeeds$1();
	replayCapturedEvents$1();
	return clear ?? (() => {});
}
hydrate$1.report = {
	mismatches: [],
	claimed: 0,
	ranges: 0,
	built: 0,
	recovered: false
};
/**
* `render`, with the one line that makes it hydration or not.
*
* §3.11: "`container.textContent = ""` … currently throws the entire server
* render away". It is still exactly right for a cold render and exactly wrong
* for a claim, so it is the parameter rather than a second copy of the mount
* sequence — there is one root, one insertion, one disposer, and the claim path
* cannot drift from the path everything else is measured on.
*/
function mount$1(block, container, claiming) {
	if (!claiming) container.textContent = "";
	const root = enterRoot$1(false);
	try {
		insertRendered$1(root, block(root), container);
	} finally {
		exit$1(root);
	}
	ownRange$1(root, () => {
		container.textContent = "";
	});
	flush$1();
	return () => {
		disposeScope$1(root);
	};
}
/**
* Create a template function for fast DOM cloning (like SolidJS)
* The template is parsed once and cloned for each use
*/
function template(html, isSVG = false, detect = false) {
	let cached = null;
	const create = () => {
		if (isSVG) {
			const wrapper = document.createElement("template");
			wrapper.innerHTML = `<svg xmlns="${SVG_NS}">${html}</svg>`;
			const innerEl = wrapper.content.firstChild?.firstChild;
			if (!innerEl) throw new Error("Invalid SVG template");
			return innerEl;
		}
		const t = document.createElement("template");
		t.innerHTML = html;
		const node = t.content.firstChild;
		if (!node) throw new Error("Invalid template");
		return node;
	};
	return () => {
		if (!cached) cached = create();
		if (OWNERSHIP$1.sink !== null) OWNERSHIP$1.sink.clone(html, getOwner$1());
		if (hydrating$1()) {
			const claimed = claimNode(cached, detect);
			if (claimed !== null) return claimed;
		}
		built();
		return cached.cloneNode(true);
	};
}
/** No key has been computed yet. `undefined` is a legal key, so it cannot say this. */
var UNSET = Symbol("barq-unset");
/**
* What the wire says when the key it chose has no safe spelling in a comment.
* The range is still claimed — positionally, which is all `<!--[-->` ever gave
* a hole — and only the COMPARISON is skipped. `ssr.ts` writes it.
*/
var OPAQUE_KEY = "?";
var EMPTY = [];
/** K7: a region with no parent owns ONE empty text node, not a comment pair. */
function siteFor(parent, anchor) {
	if (parent !== null) return {
		site: {
			parent,
			anchor
		},
		out: null
	};
	const own = document.createTextNode("");
	const out = document.createDocumentFragment();
	out.appendChild(own);
	return {
		site: {
			parent: null,
			anchor: own
		},
		out
	};
}
/**
* The server's range for this site, or `null` when nothing is being hydrated.
*
* H2's other half. A range compiled WITHOUT `hydratable` has no boundary
* comments on the wire, so a page that mixes the two is a build error rather
* than a rendering accident — and it is detected here, at the first such range,
* instead of surfacing later as a walk that ran off the end of a parent.
*
* The claim also becomes the site's anchor. Every later swap at this position
* then writes INSIDE the range it claimed, which is what keeps the boundary
* comments meaningful for the rest of the page's life rather than only for the
* first paint.
*/
function claimSite(site, parent, anchor, flags, origin) {
	if (!hydrating$1()) return;
	if ((flags & 4) === 0) {
		if (isScaffolding(anchor) || anchor === null && isScaffolding(parent)) throw new HydrationMismatch$1("not-hydratable", `${origin} was compiled without \`hydratable\` and the server's markup was compiled with it — the two halves of this deployment are not the same build`);
		report$1("not-hydratable", `${origin} reached its primitive without the hydratable flag`);
		site.cold = true;
		const stray = probeRange(parent, anchor);
		if (stray !== null) {
			if (stray.nodes.length > 0) report$1("structure", `${stray.nodes.length} server node(s) at a range with no flag`);
			releaseRange(stray);
			site.anchor = stray.close;
			site.parent = stray.close?.parentNode ?? stray.parent;
		}
		return;
	}
	const range = claimAt(parent, anchor, flags & 16);
	if (range === null) {
		site.cold = true;
		return;
	}
	site.claim = range;
	site.anchor = range.close;
	site.parent = range.close?.parentNode ?? range.parent;
}
function hostOf(site) {
	return site.anchor !== null ? site.anchor.parentNode : site.parent;
}
function insertAt(site, nodes) {
	const host = hostOf(site);
	if (host === null) return;
	let anchor = site.anchor;
	for (let i = nodes.length; i--;) {
		place(host, nodes[i], anchor);
		anchor = nodes[i];
	}
}
/**
* `insertBefore` that does nothing when the node is already there.
*
* The DOM defines `insertBefore` on a node that is already in position as a
* REMOVAL followed by an insertion, and a removal is what blurs the element
* inside it. On the claim path every node is already in position, so without
* this line hydration would move the whole page one node at a time and H6 would
* fail for the one reason claiming exists to remove.
*/
function place(parent, node, before) {
	if (node.parentNode === parent && node.nextSibling === before) return;
	parent.insertBefore(node, before);
}
/**
* Removal, in ONE DOM call when the run being removed is every child its parent
* has — `dom.ts`'s `removeNodes` states the measurement and the guard.
*
* This is the copy the LIST path reaches, and the list is where it matters:
* `clear rows` empties a `<tbody>` of 1,000 rows through `syncRows`, and the
* per-node loop was 2.85 ms of that operation's 3.95 ms of JS.
*/
function removeNodes$2(nodes) {
	const count = nodes.length;
	if (count === 0) return;
	const host = nodes[0].parentNode;
	if (host !== null && count === host.childNodes.length && allUnder$2(host, nodes)) {
		host.textContent = "";
		return;
	}
	for (let i = 0; i < count; i++) nodes[i].parentNode?.removeChild(nodes[i]);
}
function allUnder$2(host, nodes) {
	for (let i = 0; i < nodes.length; i++) if (nodes[i].parentNode !== host) return false;
	return true;
}
var NOTHING = {
	scope: null,
	nodes: EMPTY
};
/**
* O1/O2/K6. The range removal is installed on the instance scope (O3.5), so a
* disposal arriving from above removes the DOM without this module being asked.
*/
function activate$1(given, site, body, args, flags, kind) {
	const claim = site.claim ?? null;
	site.claim = null;
	if (claim === null) return attempt(given, site, body, args, flags, kind, null);
	try {
		return attempt(given, site, body, args, flags, kind, claim);
	} catch (error) {
		if (!(error instanceof HydrationMismatch$1)) throw error;
		report$1(error.kind, `${kind}: ${error.message} — the range was rebuilt`);
		releaseRange(claim);
		return attempt(given, site, body, args, flags, kind, null);
	}
}
function attempt(given, site, body, args, flags, kind, claim) {
	const under = (work) => claim !== null ? withRange$1(claim, work) : withoutClaim(work);
	if ((flags & 2) !== 0) {
		const nodes = under(() => build(given, body, args));
		evictUnclaimed(claim, nodes);
		insertAt(site, nodes);
		return {
			scope: null,
			nodes
		};
	}
	const scope = enter(given, kind);
	let nodes = EMPTY;
	let built = false;
	try {
		nodes = under(() => build(scope, body, args));
		built = true;
	} finally {
		exit$1(scope);
		if (!built) {
			disposeScope$1(scope);
			if (claim !== null) releaseRange(claim);
		}
	}
	const instance = {
		scope,
		nodes
	};
	ownRange$1(scope, () => {
		removeNodes$2(instance.nodes);
		instance.nodes = EMPTY;
	});
	evictUnclaimed(claim, nodes);
	insertAt(site, nodes);
	return instance;
}
/**
* The server's nodes at a claimed position that the body did NOT take.
*
* A body that claimed everything produces exactly the nodes it claimed and this
* removes nothing. A body that could not — a construct the flow pass refused,
* reached through an adapter with no flags to forward, or an arm that built cold
* after its first attempt threw — produces its own nodes, and the server's have
* to go or the page shows both. That was measurable as a DUPLICATED fallback,
* which is the failure a markup comparison catches and a reuse percentage does
* not.
*/
function evictUnclaimed(claim, produced) {
	if (claim === null || claim.nodes.length === 0) return;
	const kept = new Set(produced);
	let evicted = 0;
	for (const node of claim.nodes) {
		if (kept.has(node)) continue;
		node.parentNode?.removeChild(node);
		evicted++;
	}
	if (evicted > 0) report$1("structure", `${evicted} server node(s) at a range the client rebuilt`);
	claim.nodes = [];
}
/** A Cell ignores every argument (§3.0 rule 1), so one spelling serves both. */
function build(scope, body, args) {
	if (typeof body !== "function") return childToNodes$1(body, scope);
	return childToNodes$1(invoke(scope, body, args), scope);
}
/**
* C7's one call site. `errorBoundary` needs the raw result rather than `build`'s
* nodes, and routing it here is what puts the boundary's own two arms under the
* count — a boundary building its fallback twice was invisible while they were
* outside it.
*/
function invoke(scope, body, args) {
	if (diagnosticsEnabled()) countCall(body);
	return body(scope, ...args);
}
var activation = 0;
var lastSeen = /* @__PURE__ */ new WeakMap();
function countCall(body) {
	if (lastSeen.get(body) === activation) emitDiagnostic("BLOCK_EVALUATED_TWICE", "error", "a Block was invoked twice for one activation (SEMANTICS.md C7): a second call at one compile-addressed slot builds a second subtree and discards one of them.");
	lastSeen.set(body, activation);
}
function teardown(instance) {
	if (instance.scope !== null) {
		disposeScope$1(instance.scope);
		return;
	}
	removeNodes$2(instance.nodes);
}
/**
* What `branch` and `boundary` share, and the only place a key is compared, an
* instance is swapped or a throw is recovered from.
*
* `recover` is E3's `try`: a construction throw inside the selected body asks
* for the key to build instead, and `null` re-throws. `branch` passes none, so
* a plain conditional has no error path to get wrong.
*/
function region(given, site, key, bodies, flags, args, recover) {
	let instance = NOTHING;
	let previous = UNSET;
	let swapping = false;
	/**
	* The last attempt at `previous` SUSPENDED, so there is nothing standing at
	* this position and the key has not moved. Both halves have to be answered or
	* the region wedges: see `attemptTracked` below for the dependency, and the
	* `retry` test in the key effect for the rebuild.
	*/
	let retry = false;
	const pick = (k) => typeof bodies === "function" ? bodies : bodies[k];
	const swap = (k) => {
		swapping = true;
		try {
			swapInner(k);
		} finally {
			swapping = false;
		}
	};
	/**
	* A body build is UNTRACKED — a body's own reads must not become dependencies
	* of the key, or every value the content displays would re-swap the whole
	* region instead of updating in place. That is right for a body that builds,
	* and wrong for one that SUSPENDS: a `NotReadyError` means nothing was built,
	* and an untracked read registered no dependency, so nothing will ever wake
	* this position again. The boundary above shows its fallback for good.
	*
	* So a suspended body is retried TRACKED. The read then lands on the key
	* effect, the resource settling re-runs it, and `retry` is what stops the
	* "key did not move" short-circuit from reading that as nothing to do. The
	* cost is confined to the suspended case: a body that completes is never
	* tracked, so nothing about the ordinary path changes.
	*/
	const swapMaybeSuspending = (k) => {
		try {
			untrack(() => swap(k));
		} catch (error) {
			if (!(error instanceof NotReadyError$1)) throw error;
			swap(k);
		}
	};
	/**
	* H2. The written key decides what may be CLAIMED, never what is built.
	*
	* The server wrote the key it chose; the client takes its own read anyway and
	* compares. Agreement claims the range's nodes untouched. Disagreement is a
	* MISMATCH, not a vote — the claim is released, the server's nodes go, and
	* the client's arm is built in their place, with H4's blast radius being this
	* range and nothing else.
	*
	* The client's arm is the one that wins, and that is deliberate: its
	* condition is what the reactive graph will go on maintaining, so a branch
	* held on the server's arm against the client's own read has nothing that
	* would ever repair it. What the wire buys is DETECTION and a bound on the
	* damage. Keeping the server's arm until the client is seeded needs a
	* seeding barrier nobody has specified, and H2 does not claim it.
	*/
	const reconcileKey = (k) => {
		const claim = site.claim;
		if (claim === void 0 || claim === null) return k;
		const wire = rangeKey(claim);
		if (wire === null || wire === OPAQUE_KEY) return k;
		if (wire === String(k)) return k;
		report$1("key", `the server took branch ${JSON.stringify(wire)}, the client takes ${String(k)}`);
		releaseRange(claim);
		site.claim = null;
		return k;
	};
	const swapInner = (k) => {
		if (instance !== NOTHING) {
			teardown(instance);
			instance = NOTHING;
		}
		k = reconcileKey(k);
		activation++;
		const body = pick(k);
		if (body === null || body === void 0) return;
		if (recover === null) {
			instance = activate$1(given, site, body, args, flags, "branch");
			return;
		}
		try {
			instance = activate$1(given, site, body, args, flags, "branch");
		} catch (error) {
			const alternative = recover(error);
			if (alternative === null) throw error;
			previous = alternative;
			const fallback = pick(alternative);
			if (fallback === null || fallback === void 0) return;
			activation++;
			instance = activate$1(given, site, fallback, args, flags, "branch");
		}
	};
	if ((flags & 1) !== 0) {
		const k = untrack(key);
		cellSlot$1(k, "branch key");
		swap(k);
	} else renderEffect$1(() => {
		const k = key();
		cellSlot$1(k, "branch key");
		if (previous !== UNSET && k === previous && !retry) return;
		previous = k;
		retry = true;
		swapMaybeSuspending(k);
		retry = false;
	});
	if ((flags & 2) !== 0) onCleanup(() => teardown(instance));
	/**
	* Re-read the key and swap if it moved, outside the effect.
	*
	* E2 routes an error to `s.catcher`, and a catcher that only WRITES a signal
	* is at the mercy of the flush it was called from: an error raised by an
	* effect during the very flush that created this region marks a render effect
	* that has already run, and the mark is consumed by nothing. A boundary that
	* recovers on the second flush and not the first is not a boundary. So the
	* catcher acts, and the key it re-reads is the same expression the effect
	* reads — one decision procedure, two entry points.
	*/
	return () => {
		if (swapping) return;
		const k = untrack(key);
		if (previous !== UNSET && k === previous && !retry) return;
		previous = k;
		retry = true;
		swapMaybeSuspending(k);
		retry = false;
	};
}
/**
* C3.8 at the four Cell slots of the primitive surface — `branch`'s key,
* `each`'s source, `boundary`'s `on` and `portal`'s target.
*
* `setProp` and `components.ts` route their slots through `readSlot`; these four
* did not, so a Block reaching one of them was invoked with no argument and its
* return value used. A `block()`-made Block carries an entry guard and threw on
* its own; a `pin()`ned one is branded but deliberately UNGUARDED, so it ran
* silently — C3.8 is a property of the VALUE, and for these four slots it had
* become a property of the call site.
*
* Split from `readSlot` rather than reusing it because the call sites keep
* control of tracking: `branch` reads its key inside `untrack` on the
* `STATIC_KEY` path and inside a `renderEffect` otherwise, and `readSlot` would
* decide that for them.
*/
function cellSlot$1(value, origin) {
	if (isBlock$1(value)) throw new ScopeMissingError$1(`${origin} (a Block reached a Cell slot)`);
}
/**
* K2/K5/K6. `key` is plain emitted JavaScript, usually an integer index into
* `bodies`; an unchanged key is a no-op and a changed one disposes and rebuilds.
*
* `bodies` may be a single Block used for every key, which is how `Dynamic` keys
* on a component VALUE rather than on an index.
*
* There is deliberately NO slot-argument parameter: a body wanting the branch's
* value is wrapped by whoever emits it, so the value is read at ACTIVATION time.
* A parameter here would be captured at construction, which is the staleness the
* keyed form exists to avoid.
*
* Returns the anchor to insert when the caller supplied no `parent`, else `null`.
*/
function branch(s, parent, anchor, key, bodies, flags = 0) {
	const given = requireScope$1(s, "branch");
	cellSlot$1(key, "branch key");
	const { site, out } = siteFor(parent, anchor);
	claimSite(site, parent, anchor, flags, "branch");
	underScope$1(given, "branch", () => region(given, site, key, bodies, flags, EMPTY_ARGS, null));
	return out;
}
var EMPTY_ARGS = [];
/**
* E3: a boundary is a `branch` keyed on `{content | fallback}` plus a `try`.
*
* E2.1 is why the content Block is called INSIDE this function rather than
* handed to it already built: the catcher is installed on the instance scope
* before the Block runs, so a construction throw lands in this `try`.
*
* E2.3: `NotReadyError` is re-thrown, never captured — an error boundary passes
* it through to the nearest `Loading`.
*/
function boundary$1(s, parent, anchor, kind, fallback, body, flags = 0, on) {
	const given = requireScope$1(s, "boundary");
	if (on !== void 0) cellSlot$1(on, "boundary on");
	const { site, out } = siteFor(parent, anchor);
	claimSite(site, parent, anchor, flags, "boundary");
	if (kind === "error") errorBoundary$1(given, site, fallback, body, flags);
	else loadingBoundary$1(given, site, fallback, body, on);
	if (site.claim !== void 0 && site.claim !== null) {
		const stranded = site.claim;
		site.claim = null;
		if (stranded.nodes.length > 0) {
			report$1("structure", `${stranded.nodes.length} server node(s) at a boundary that parks`);
			releaseRange(stranded);
		}
	}
	return out;
}
function errorBoundary$1(given, site, fallback, body, flags) {
	const collector = createErrorCollector$1();
	const reset = () => collector.clear();
	const asError = (err) => err instanceof Error ? err : new Error(String(err));
	let refresh = () => {};
	const install = (scope) => {
		provideOn$1(scope, ERROR_BOUNDARY$1, (err) => {
			if (err instanceof NotReadyError$1) throw err;
			collector.capture(err);
			refresh();
		});
	};
	const content = (scope) => {
		install(scope);
		return invoke(scope, body, EMPTY_ARGS);
	};
	const recovered = (scope) => {
		if (fallback === null || fallback === void 0) return null;
		const error = () => asError(collector.error());
		return invoke(scope, fallback, [error, reset]);
	};
	const key = () => collector.failed() ? 1 : 0;
	const recover = (error) => {
		if (error instanceof NotReadyError$1) return null;
		collector.capture(error);
		return 1;
	};
	underScope$1(given, "boundary", () => {
		refresh = region(given, site, key, [content, recovered], flags, EMPTY_ARGS, recover);
		refresh();
	});
}
/**
* One scope, entered once: the collector's home and the owner of both arms, so
* the static ownership tree — ONE `branch` node per `Loading` — is what the
* runtime produces.
*
* The content is a live hole rather than a branch arm, and that is forced:
* `NotReadyError` registers the EFFECT that threw with the nearest
* `LOADING_BOUNDARY` on its own scope chain, so a build outside an effect under
* this scope can never be known to be pending.
*
* The content is PARKED, not disposed, while the fallback shows (§3.8). That
* parking deliberately does NOT reach `branch`: transitions are unspecified (A5).
*/
function loadingBoundary$1(given, site, fallback, body, on) {
	const pending = createPendingCollector$1();
	const revealed = signal$1(false);
	const stored = lookupContext$1(given, REVEAL_COORD);
	const handle = typeof stored === "object" && stored !== null ? stored : void 0;
	const own = enter(given, "branch");
	const park = {
		parent: document.createDocumentFragment(),
		anchor: null
	};
	let live = park;
	let instance = NOTHING;
	let shown = EMPTY;
	const move = (target) => {
		if (live === target) return;
		const moving = live === park ? [...park.parent.childNodes] : instance.nodes;
		live = target;
		insertAt(target, moving);
	};
	try {
		pending.install(own);
		renderEffect$1(() => {
			const next = attempt(own, live, body, EMPTY_ARGS, 0, "branch", null);
			if (instance !== NOTHING) teardown(instance);
			instance = next;
		});
		renderEffect$1(() => {
			if (pending.count() === 0) revealed.set(true);
		});
		if (on !== void 0) {
			let first = true;
			let last;
			renderEffect$1(() => {
				const value = on();
				cellSlot$1(value, "boundary on");
				if (!first && value !== last && untrack(() => pending.count()) > 0) revealed.set(false);
				last = value;
				first = false;
			});
		}
		const slot = handle?.register({
			ready: () => revealed(),
			minimallyReady: () => revealed()
		});
		const mode = () => {
			if (slot !== void 0) {
				const display = slot.display();
				return display === "content" ? 0 : display === "fallback" ? 1 : 2;
			}
			return pending.count() > 0 && !revealed() ? 1 : 0;
		};
		let showing = -1;
		renderEffect$1(() => {
			const next = mode();
			if (next === showing) return;
			showing = next;
			untrack(() => {
				if (shown.length !== 0) {
					removeNodes$2(shown);
					shown = EMPTY;
				}
				if (next === 0) {
					move(site);
					return;
				}
				move(park);
				if (next === 1 && fallback !== null && fallback !== void 0) {
					activation++;
					shown = build(own, fallback, EMPTY_ARGS);
					insertAt(site, shown);
				}
			});
		});
		onCleanup(() => {
			removeNodes$2(shown);
			shown = EMPTY;
			slot?.unregister();
		});
	} finally {
		exit$1(own);
	}
}
//#endregion
//#region ../../../packages/router/dist/components-DZybFm7Y.js
var keys = 0;
var nextKey = () => `k${keys++}`;
/** Split a full `path?query#hash` into its three pieces. */
function parseLocation(url, state = null) {
	const hashAt = url.indexOf("#");
	const hash = hashAt === -1 ? "" : url.slice(hashAt);
	const withoutHash = hashAt === -1 ? url : url.slice(0, hashAt);
	const searchAt = withoutHash.indexOf("?");
	const search = searchAt === -1 ? "" : withoutHash.slice(searchAt);
	const pathname = searchAt === -1 ? withoutHash : withoutHash.slice(0, searchAt);
	return {
		pathname: pathname === "" ? "/" : pathname,
		search,
		hash,
		state,
		key: nextKey()
	};
}
/** The full URL a location addresses, base-relative. */
function href(location) {
	return `${location.pathname}${location.search}${location.hash}`;
}
/**
* A history in an array. Used for tests, for SSR, and for anything without a
* `window` — and it really records, so back and forward work.
*/
function memoryHistory(options = {}) {
	const stack = (options.initial ?? ["/"]).map((entry) => parseLocation(entry));
	let index = options.index ?? stack.length - 1;
	const listeners = /* @__PURE__ */ new Set();
	const emit = (action) => {
		const location = stack[index];
		for (const listener of [...listeners]) listener(location, action);
	};
	return {
		current: () => stack[index],
		go(delta) {
			const target = index + delta;
			if (target < 0 || target >= stack.length) return;
			index = target;
			emit("pop");
		},
		push(to, pushOptions) {
			const location = parseLocation(to, pushOptions?.state ?? null);
			if (pushOptions?.replace === true) {
				stack[index] = location;
				emit("replace");
				return;
			}
			stack.length = index + 1;
			stack.push(location);
			index = stack.length - 1;
			emit("push");
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}
/** The splat's key in `params`, matching the pattern that produced it. */
var SPLAT_KEY = "_splat";
/**
* Split a pathname or a pattern into its segments.
*
* A trailing slash is dropped, so `/users` and `/users/` are the same route.
* The old router anchored `^…$` per route and treated them as different
* strings, so serving both meant declaring both — recorded as a wart rather
* than reproduced.
*/
function splitPath(path) {
	const out = [];
	let from = 0;
	const end = path.length;
	for (let i = 0; i <= end; i++) if (i === end || path.charCodeAt(i) === 47) {
		if (i > from) out.push(path.slice(from, i));
		from = i + 1;
	}
	return out;
}
/** Parse a path PATTERN into segments. */
function parsePattern(pattern) {
	return splitPath(pattern).map((raw) => {
		if (raw === "$") return {
			kind: "splat",
			name: SPLAT_KEY
		};
		if (raw.charCodeAt(0) === 36) return {
			kind: "param",
			name: raw.slice(1)
		};
		return {
			kind: "static",
			value: raw
		};
	});
}
/**
* Join a parent pattern with a child's.
*
* A child pattern beginning with `/` is absolute and replaces the parent's,
* which is how a route escapes its layout without leaving it.
*/
function joinPattern(parent, child) {
	if (child === void 0 || child === "") return parent;
	if (child.charCodeAt(0) === 47) return normalize(child);
	return normalize(`${parent}/${child}`);
}
/** One leading slash, no trailing slash, no empty segments. */
function normalize(path) {
	const segments = splitPath(path);
	return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}
/**
* Fill a pattern's parameters from a params record.
*
* The inverse of matching, and what `<Link to>` uses to build an href from a
* route id plus params.
*/
function interpolate(pattern, params) {
	const parts = [];
	for (const segment of parsePattern(pattern)) {
		if (segment.kind === "static") {
			parts.push(segment.value);
			continue;
		}
		const value = params[segment.name];
		if (value === void 0) throw new Error(`missing route parameter ${JSON.stringify(segment.name)} for ${pattern}`);
		if (segment.kind === "splat") parts.push(...splitPath(value));
		else parts.push(encodeURIComponent(value));
	}
	return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}
/** Whether `to` addresses something outside the application entirely. */
function leavesTheApp(to) {
	return to.startsWith("#") || to.startsWith("//") || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(to);
}
/**
* Resolve `to` against `from`.
*
* `from` is treated as a directory, so `resolvePath("child", "/parent")` is
* `/parent/child`. Over-popping is clamped rather than throwing: `../../../x`
* from `/a` is `/x`, because a link that walks off the root is a mistake in the
* link and not a reason to break the page.
*/
function resolvePath(to, from) {
	if (leavesTheApp(to)) return to;
	if (to.charCodeAt(0) === 47) return normalize(to);
	const base = splitPath(from);
	let rest = to;
	while (rest.startsWith("./")) rest = rest.slice(2);
	while (rest.startsWith("../")) {
		base.pop();
		rest = rest.slice(3);
	}
	if (rest === "..") {
		base.pop();
		rest = "";
	}
	return normalize([...base, ...splitPath(rest)].join("/"));
}
/**
* Whether `pathname` is at or under `prefix`, on a SEGMENT boundary.
*
* `/user-settings` is not under `/user`, which a `startsWith` gets wrong and
* which is what `<NavLink>`'s active state turns on.
*/
function isUnder(pathname, prefix) {
	if (prefix === "/") return true;
	if (!pathname.startsWith(prefix)) return false;
	return pathname.length === prefix.length || pathname.charCodeAt(prefix.length) === 47;
}
/**
* The matcher: a segment trie, built once from the route table.
*
* Measured against the old regex-per-route linear scan (`stats.paired`, 41
* trials x 2000 iterations, Bun): at 200 routes a last-position hit cost
* 3.3 µs and a miss 3.6 µs, both linear in the matched route's POSITION. One
* regex exec is 14 ns, so the regexes were never the cost — 200 iterations
* were.
*
* A generated switch was measured too, and REJECTED: it beat a plain
* first-segment bucket by 58 ns on a last-position hit and by nothing at all on
* a miss, while costing a code generator and 76 kB of emitted JavaScript at
* 1000 routes. `CODESIGN.md` §3.4's rule decided it — "a flag that moves neither
* an allocation count nor a wall-clock number on a named benchmark is deleted,
* not kept". A trie is the same idea as the bucket, one level deeper, and it is
* built at runtime from data.
*
* Ranking is structural, not scored. The walk tries static before parameter
* before splat and BACKTRACKS, so `/users/new` beats `/users/$id` because the
* static edge is taken first, and `/a/$b/c` is still reachable when `/a/x/d`
* matched `x` and then failed. The old router had no ranking at all: the first
* route in declaration order won, so `/users/new` declared after `/users/$id`
* was unreachable.
*/
function node() {
	return {
		statics: /* @__PURE__ */ new Map(),
		param: null,
		paramName: "",
		leaf: null,
		splat: null,
		splatName: SPLAT_KEY
	};
}
/**
* Build a matcher.
*
* Two routes reaching the same terminal is a conflict rather than a silent
* shadowing: the old router resolved it by declaration order, which made a
* route unreachable without saying so.
*/
function createMatcher(routes) {
	const root = node();
	for (const route of routes) {
		let current = root;
		let splatted = false;
		for (const segment of route.segments) if (segment.kind === "static") {
			let next = current.statics.get(segment.value);
			if (next === void 0) {
				next = node();
				current.statics.set(segment.value, next);
			}
			current = next;
		} else if (segment.kind === "param") {
			if (current.param === null) {
				current.param = node();
				current.paramName = segment.name;
			} else if (current.paramName !== segment.name) throw new Error(`route ${route.fullPath} names a parameter $${segment.name} where another route names $${current.paramName}; one position, one name`);
			current = current.param;
		} else {
			if (current.splat !== null) throw new Error(`two routes claim the splat at ${route.fullPath}`);
			current.splat = route;
			current.splatName = segment.name;
			splatted = true;
			break;
		}
		if (splatted) continue;
		if (current.leaf !== null) throw new Error(`two routes match the same path: ${current.leaf.fullPath} and ${route.fullPath}`);
		current.leaf = route;
	}
	/**
	* Walk from `current` at `index`, filling `values` as parameters are taken.
	*
	* `values` is a plain array indexed by depth rather than an object built per
	* candidate, so a failed branch costs no allocation to undo — the entry is
	* simply overwritten by the next attempt.
	*/
	const walk = (current, segments, index, values, names) => {
		if (index === segments.length) {
			if (current.leaf !== null) return current.leaf;
			if (current.splat !== null) {
				values[index] = "";
				names[index] = current.splatName;
				return current.splat;
			}
			return null;
		}
		const segment = segments[index];
		const nextStatic = current.statics.get(segment);
		if (nextStatic !== void 0) {
			names[index] = null;
			const found = walk(nextStatic, segments, index + 1, values, names);
			if (found !== null) return found;
		}
		if (current.param !== null) {
			values[index] = decodeSegment(segment);
			names[index] = current.paramName;
			const found = walk(current.param, segments, index + 1, values, names);
			if (found !== null) return found;
		}
		if (current.splat !== null) {
			values[index] = segments.slice(index).map(decodeSegment).join("/");
			names[index] = current.splatName;
			return current.splat;
		}
		return null;
	};
	return {
		routes,
		match(pathname) {
			const segments = splitPath(pathname);
			const values = new Array(segments.length + 1).fill(null);
			const names = new Array(segments.length + 1).fill(null);
			const route = walk(root, segments, 0, values, names);
			if (route === null) return null;
			const params = {};
			for (let i = 0; i < names.length; i++) {
				const name = names[i];
				if (name !== null) params[name] = values[i];
			}
			return {
				route,
				params
			};
		}
	};
}
/**
* A percent-encoded parameter is decoded; a malformed one is handed over as it
* arrived rather than throwing, because a bad URL is a 404 and not a 500.
*/
function decodeSegment(segment) {
	if (!segment.includes("%")) return segment;
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}
/** Identity, plus a place to hang inference later. */
function route(definition) {
	return definition;
}
/**
* Flatten a table into the list the matcher indexes.
*
* Only a route that can be the LEAF of a match is emitted — a layout with
* children is reachable through them and never on its own. A layout that should
* also be addressable declares an index child, which is `path: ""`.
*/
function flattenRoutes(table) {
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	const visit = (definitions, parentPath, parentChain) => {
		for (const definition of definitions) {
			const fullPath = joinPattern(parentPath, definition.path);
			const id = definition.id ?? fullPath;
			const self = {
				id,
				fullPath,
				definition
			};
			const chain = [...parentChain, self];
			const children = definition.children;
			if (children !== void 0 && children.length > 0) {
				visit(children, fullPath, chain);
				continue;
			}
			if (seen.has(id)) throw new Error(`two routes claim the id ${JSON.stringify(id)}`);
			seen.add(id);
			out.push({
				id,
				fullPath,
				segments: parsePattern(fullPath),
				chain
			});
		}
	};
	visit(table, "", []);
	return out;
}
/**
* Router state: the location, the match, and the loader cells.
*
* A loader's result is a KEYED async `computed`, not a promise stored in a
* signal. That one decision is what makes SSR work with no second mechanism:
* the server reads it during the render and the seed channel records it under
* its key, and the client's first read of the same key consumes the seed
* instead of fetching. `signals.ts` already does all of it — the router's whole
* contribution is choosing a key that is stable across the two sides.
*
* The key is EXPLICIT and never the positional auto-key. A position is not an
* identity: "if the client tree diverges from the server's, the ids after the
* divergence shift, and a read can claim the value recorded for a DIFFERENT
* call". A client-side navigation before hydration is exactly that divergence.
*/
/** How many resolved loader cells to keep. Beyond this the oldest go. */
var DEFAULT_CACHE_SIZE = 100;
/** What a loader cell is keyed by, and what the seed carries. */
function loaderKey(routeId, params) {
	return `r:${routeId}|${Object.keys(params).toSorted().map((name) => `${name}=${params[name]}`).join("&")}`;
}
function createRouter(config) {
	const history = config.history ?? memoryHistory();
	const matcher = createMatcher(flattenRoutes(config.routes));
	const location = signal$1(history.current());
	const generation = signal$1(0);
	const match = computed(() => matcher.match(location().pathname));
	const params = computed(() => match()?.params ?? {});
	const search = computed(() => new URLSearchParams(location().search));
	const chain = computed(() => match()?.route.chain ?? []);
	const cells = /* @__PURE__ */ new Map();
	const limit = config.cacheSize ?? DEFAULT_CACHE_SIZE;
	const dataFor = (route, forParams) => {
		const loader = route.definition.loader;
		const key = `${loaderKey(route.id, forParams)}#${untrack(generation)}`;
		const existing = cells.get(key);
		if (existing !== void 0) return existing;
		const build = () => loader === void 0 ? () => void 0 : computed(async () => {
			const controller = new AbortController();
			try {
				return await loader({
					params: forParams,
					search: untrack(search),
					signal: controller.signal
				});
			} catch (error) {
				config.onLoaderError?.(error);
				throw error;
			}
		}, { key: loaderKey(route.id, forParams) });
		const cell = runWithOwner(null, build);
		cells.set(key, cell);
		if (cells.size > limit) {
			const oldest = cells.keys().next();
			if (!oldest.done) cells.delete(oldest.value);
		}
		return cell;
	};
	const unsubscribe = history.subscribe((next) => {
		location.set(next);
		for (const hook of config.afterEach ?? []) hook(next);
	});
	const runGuards = async (to) => {
		const from = untrack(location);
		const candidate = matcher.match(to.pathname);
		const context = {
			from,
			to,
			params: candidate?.params ?? {}
		};
		const guards = [...config.beforeEach ?? []];
		for (const route of candidate?.route.chain ?? []) {
			const own = route.definition.beforeEnter;
			if (own !== void 0) guards.push(own);
		}
		for (const guard of guards) {
			const verdict = await guard(context);
			if (verdict !== true && verdict !== void 0) return verdict;
		}
		return true;
	};
	let hops = 0;
	const MAX_REDIRECTS = 10;
	const navigate = async (to, options) => {
		if (leavesTheApp(to)) {
			if (typeof window !== "undefined") window.location.assign(to);
			return;
		}
		const cut = to.search(/[?#]/);
		const pathPart = cut === -1 ? to : to.slice(0, cut);
		const rest = cut === -1 ? "" : to.slice(cut);
		const target = parseLocation(resolvePath(pathPart === "" ? untrack(location).pathname : pathPart, untrack(location).pathname) + rest, options?.state ?? null);
		const verdict = await runGuards(target);
		if (verdict === false) return;
		if (typeof verdict === "string") {
			if (hops++ >= MAX_REDIRECTS) {
				hops = 0;
				console.error(`[barq/router] more than ${MAX_REDIRECTS} redirects; giving up at ${verdict}`);
				return;
			}
			await navigate(verdict, { replace: true });
			hops = 0;
			return;
		}
		hops = 0;
		history.push(href(target), {
			replace: options?.replace,
			state: options?.state
		});
	};
	return {
		location,
		match,
		params,
		search,
		chain,
		matcher,
		config,
		history,
		dataFor,
		navigate,
		invalidate() {
			cells.clear();
			generation.set(untrack(generation) + 1);
		},
		dispose() {
			unsubscribe();
			cells.clear();
		}
	};
}
/**
* The components, on the primitive ABI the compiler emits.
*
* Written against `branch`/`boundary`/`provide` directly rather than authored in
* JSX, so there is one implementation in an application bundle and in this
* package's own tests. `packages/extra/src/router.ts` does the same and for the
* same reason.
*
* Two shapes are load-bearing and neither is React's:
*
*  - **`(scope, props)`.** Every component and every Block. The scope is first
*    and is not optional.
*  - **`children` is a Block**, so a layout CONSTRUCTS the next route inside its
*    own scope. A provider or a boundary a layout installs is therefore visible
*    to the route it wraps, which an outlet cannot do.
*/
var RouterContext = context(void 0, "barq-router");
/** The router this subtree is under. Resolved through the SCOPE chain, so a portalled `<Link>` still finds it. */
function useRouter() {
	return read(RouterContext)();
}
var NOT_FOUND = "404 - Not Found";
/**
* One `branch` per depth, keyed on the route's identity.
*
* `data` is deliberately NOT in the key. It arrives as a Cell, so a loader
* landing UPDATES the route rather than remounting it — which is what keeps a
* surviving `<Link>`'s element identity across a navigation within the same
* layout, and what an identity-gated re-render used to be hand-rolled for.
*/
function renderDepth(scope, state, depth, parent, anchor) {
	const routeAt = () => state.chain()[depth] ?? null;
	const body = (instance) => {
		const route = untrack(routeAt);
		if (route === null) {
			if (depth > 0) return null;
			const fallback = state.config.notFound;
			if (fallback !== void 0) return fallback(instance, routeProps(state, depth, null));
			return document.createTextNode(NOT_FOUND);
		}
		const component = route.definition.component;
		const content = (contentScope) => untrack(() => component === void 0 ? renderDepth(contentScope, state, depth + 1, null, null) : component(contentScope, routeProps(state, depth, route)));
		return boundary$1(instance, null, null, "loading", routeFallback(route), content, 0, () => state.location().pathname);
	};
	return branch(scope, parent, anchor, routeAt, body);
}
function routeFallback(route) {
	const pending = route.definition.pending;
	if (pending === void 0) return null;
	return ((fallbackScope) => pending(fallbackScope, {
		params: () => ({}),
		data: () => void 0,
		children: (() => null)
	}));
}
/** `children` is a Block, so a layout builds the next route in its own scope. */
function routePropsFor(state, depth, route, children) {
	return props([{
		params: () => state.params(),
		data: () => route === null ? void 0 : state.dataFor(route, state.params())(),
		children
	}]);
}
function routeProps(state, depth, route) {
	return props([{
		params: () => state.params(),
		data: () => route === null ? void 0 : state.dataFor(route, state.params())(),
		children: block((childScope) => renderDepth(childScope, state, depth + 1, null, null))
	}]);
}
/**
* Render an ALREADY-BUILT router state.
*
* The server needs this: the page handler creates the state so it can hand it an
* `onLoaderError` and read the answer back, and the app renders that state
* rather than making a second one.
*/
function RouterProviderImpl(scope, props) {
	const state = readSlot(props.state, "RouterProvider.state");
	return provide(scope, RouterContext, cell(state), (inner) => renderDepth(inner, state, 0, null, null));
}
function RouterImpl(scope, props) {
	const state = createRouter({
		routes: readSlot(props.routes, "Router.routes"),
		history: props.history === void 0 ? void 0 : readSlot(props.history, "Router.history"),
		notFound: props.notFound === void 0 ? void 0 : readSlot(props.notFound, "Router.notFound"),
		beforeEach: props.beforeEach === void 0 ? void 0 : readSlot(props.beforeEach, "Router.beforeEach"),
		afterEach: props.afterEach === void 0 ? void 0 : readSlot(props.afterEach, "Router.afterEach")
	});
	onCleanup(() => state.dispose());
	return provide(scope, RouterContext, cell(state), (inner) => renderDepth(inner, state, 0, null, null));
}
var anchorTemplate = template("<a></a>");
/**
* Resolve a `to` that may be a route ID, a relative path or an absolute one.
*
* A route id is tried first and falls through to path resolution, so
* `to="/users/$id"` with `params` builds `/users/7` while `to="/users/7"` is
* taken as it stands.
*/
function resolveTo(state, props) {
	const to = readSlot(props.to, "Link.to");
	if (leavesTheApp(to)) return to;
	const params = props.params === void 0 ? void 0 : readSlot(props.params, "Link.params");
	const pattern = state.matcher.routes.find((route) => route.id === to)?.fullPath;
	const path = pattern !== void 0 ? interpolate(pattern, params ?? {}) : params !== void 0 ? interpolate(to, params) : resolvePath(to, state.location().pathname);
	const search = props.search === void 0 ? void 0 : readSlot(props.search, "Link.search");
	if (search === void 0) return path;
	const query = typeof search === "string" ? search.replace(/^\?/, "") : new URLSearchParams(search).toString();
	return query === "" ? path : `${path}?${query}`;
}
function anchorElement(scope, props, extra) {
	const state = useRouter();
	const element = anchorTemplate();
	const target = () => resolveTo(state, props);
	bindProp(scope, element, setAttr, "href", target);
	if (props.class !== void 0) bindProp(scope, element, setClass, "class", () => readSlot(props.class, "Link.class"));
	listen(scope, element, "click", ((event) => {
		const to = target();
		if (leavesTheApp(to)) return;
		if (event.defaultPrevented || event.button !== 0) return;
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		if (element.hasAttribute("download") || element.target === "_blank") return;
		event.preventDefault();
		state.navigate(to, {
			replace: props.replace === void 0 ? false : Boolean(readSlot(props.replace, "Link.replace")),
			state: props.state === void 0 ? void 0 : readSlot(props.state, "Link.state")
		});
	}));
	extra(element, target);
	const children = props.children;
	if (children !== void 0) {
		const value = readSlot(children, "Link.children");
		if (value !== void 0 && value !== null) element.append(value);
	}
	return element;
}
function LinkImpl(scope, props) {
	return anchorElement(scope, props, () => {});
}
function NavLinkImpl(scope, props) {
	const state = useRouter();
	return anchorElement(scope, props, (element, target) => {
		const active = () => {
			const to = target().split("?")[0];
			const here = state.location().pathname;
			return (props.end === void 0 ? false : Boolean(readSlot(props.end, "NavLink.end"))) ? here === to : isUnder(here, to);
		};
		const activeClass = () => props.activeClass === void 0 ? "active" : readSlot(props.activeClass, "NavLink.activeClass");
		bindProp(scope, element, setAttr, "aria-current", () => active() ? "page" : null);
		bindProp(scope, element, setClass, "class", () => {
			const base = props.class === void 0 ? "" : readSlot(props.class, "Link.class");
			return active() ? `${base} ${activeClass()}`.trim() : base;
		});
	});
}
function RedirectImpl(_scope, props) {
	useRouter().navigate(readSlot(props.to, "Redirect.to"), { replace: props.replace === void 0 ? true : Boolean(readSlot(props.replace, "Redirect.replace")) });
	return null;
}
block(RouterImpl);
block(RouterProviderImpl);
block(LinkImpl);
block(NavLinkImpl);
block(RedirectImpl);
//#endregion
//#region ../../../packages/core/dist/internal.js
/**
* The L2b ownership trace's attachment point (CODESIGN.md §6). `null` until
* `beginOwnershipTrace()` installs a sink.
*
* why: a `const` holder rather than an `export let`, and `import type` above
* rather than a value import, because Bun inlines a module-scope numeric
* `const` (`REACTIVE_DISPOSED` → `32`) only while a module has neither a value
* import nor a reassigned top-level binding — and a signal accessor's
* `toString()` is observable, since `diagnostic-accessor-coercion.tsx` renders
* it into the DOM and snapshots it. Either of the obvious spellings moves that
* snapshot.
*/
var OWNERSHIP = { sink: null };
var REACTIVE_CHECK = 1;
var REACTIVE_DIRTY = 2;
var REACTIVE_RECOMPUTING_DEPS = 4;
var REACTIVE_IN_HEAP = 8;
var REACTIVE_IN_HEAP_HEIGHT = 16;
var REACTIVE_DISPOSED = 32;
var REACTIVE_UNINITIALIZED = 64;
var STATUS_PENDING = 128;
var STATUS_ERROR = 256;
var REACTIVE_CHILDREN_FORBIDDEN = 512;
var EFFECT_PURE = 0;
var EFFECT_RENDER = 1;
var EFFECT_USER = 2;
/**
* §3.0 rule 3's brand and its enforcement, in one value.
*
* The brand is POSITIVE: it means "this value requires a scope". An unbranded
* function is a Cell, or a Block that ignores its scope (an arity-0
* `template()`, C6) — which is simultaneously a legal Cell, which is why rule 2
* lets one call site serve both kinds. Kind travels with the value (rule 4),
* so a forwarded Block is still branded and an arity guess is never consulted.
*
* C3.8 is a property of the VALUE, not of a call site. A marked-in-place `fn`
* makes the brand readable but leaves "invoked without a scope" enforceable only
* where someone remembered to ask, and six of the seven Cell slots on the
* primitive surface did not — so a Block reaching one ran with `s === undefined`
* and every ambient read inside it resolved against `CURRENT`, which is the
* Provider bug at the one place §3.0 says nobody would look. The wrapper is one
* closure per DEFINITION site and none per activation.
*
* It lives here rather than in `props.ts` for the reason `scope.ts` states at
* the top of the file: this module may acquire no VALUE import, because Bun
* stops inlining a module-scope numeric `const` once it has one, and a signal
* accessor's own `toString()` is snapshotted by a fixture.
*/
var BLOCK = Symbol.for("barq.block");
/** Whether `value` is a Block that declared it needs the scope it is handed. */
function isBlock(value) {
	return typeof value === "function" && Boolean(value[BLOCK]);
}
/**
* §3.0 rule 3. A construct invoked without a scope throws and NEVER falls back
* to the ambient owner: that fallback is the Provider bug reintroduced at the
* one place nobody would look for it.
*
* `null` is a scope VALUE, not a missing one — it is what the compiler emits
* for a module-level root (`const _s$ = null`). Only `undefined` is missing.
*/
var ScopeMissingError = class extends Error {
	origin;
	constructor(origin) {
		super(`${origin} was invoked without a scope. A Block takes the scope it must run under as its first argument; calling it with none is a mistimed construction, and falling back to the ambient owner would put the subtree under whatever happened to be current instead.`);
		this.origin = origin;
		this.name = "ScopeMissingError";
	}
};
/**
* Thrown when reading an async value that has not resolved yet.
* Caught by Loading boundaries and by isPending()/latest().
*/
var NotReadyError = class extends Error {
	/**
	* The node whose read threw, when there is one.
	*
	* `latest` and `isPending` both need it: their rule is not "was it pending"
	* but "was it pending AND has it never held a value", and only the source
	* knows the second half.
	*/
	source;
	constructor(source) {
		super("Async value is not ready yet.");
		this.name = "NotReadyError";
		this.source = source;
	}
};
/** Context key for Loading boundaries (used by components) */
var LOADING_BOUNDARY = Symbol("loading-boundary");
/** Context key for error boundaries; value is (err: unknown) => void */
var ERROR_BOUNDARY = Symbol("error-boundary");
/** Sentinel for "no occupied height"; any real height compares lower */
var HEAP_EMPTY_MIN = 2147483647;
function createHeap() {
	return {
		_heap: new Array(256).fill(void 0),
		_min: HEAP_EMPTY_MIN,
		_max: 0,
		_count: 0
	};
}
var renderHeap = createHeap();
var userHeap = createHeap();
function heapFor(node) {
	return node._kind === EFFECT_USER ? userHeap : renderHeap;
}
/** Actually insert node into heap at its height level */
function actualInsertIntoHeap(node, heap) {
	const height = node._height;
	if (height >= heap._heap.length) heap._heap.length = height + 100;
	const heapAtHeight = heap._heap[height];
	if (heapAtHeight === void 0) {
		heap._heap[height] = node;
		node._prevHeap = node;
		node._nextHeap = void 0;
	} else {
		const tail = heapAtHeight._prevHeap;
		tail._nextHeap = node;
		node._prevHeap = tail;
		node._nextHeap = void 0;
		heapAtHeight._prevHeap = node;
	}
	if (height > heap._max) heap._max = height;
	if (height < heap._min) heap._min = height;
	heap._count++;
}
/** Insert node into heap for recomputation */
function insertIntoHeap(node, heap) {
	const flags = node._flags;
	if (flags & 12) return;
	node._flags = flags | REACTIVE_IN_HEAP;
	if (!(flags & REACTIVE_IN_HEAP_HEIGHT)) actualInsertIntoHeap(node, heap);
}
/** Insert node into heap for height adjustment only */
function insertIntoHeapHeight(node, heap) {
	const flags = node._flags;
	if (flags & 28) return;
	node._flags = flags | REACTIVE_IN_HEAP_HEIGHT;
	actualInsertIntoHeap(node, heap);
}
/** Remove node from heap */
function deleteFromHeap(node, heap) {
	const flags = node._flags;
	if (!(flags & 24)) return;
	node._flags = flags & -25;
	const height = node._height;
	const heapHead = heap._heap[height];
	if (!heapHead) return;
	if (node._prevHeap === node) heap._heap[height] = void 0;
	else {
		const next = node._nextHeap;
		const end = next ?? heapHead;
		if (node === heapHead) heap._heap[height] = next;
		else node._prevHeap._nextHeap = next;
		end._prevHeap = node._prevHeap;
	}
	node._prevHeap = node;
	node._nextHeap = void 0;
	heap._count--;
}
/** Adjust height of a node based on its dependencies */
function adjustHeight(node, heap) {
	deleteFromHeap(node, heap);
	let newHeight = node._height;
	for (let d = node._deps; d !== null; d = d._nextDep) {
		const dep = d._dep;
		if (dep._fn !== void 0 && dep._height >= newHeight) newHeight = dep._height + 1;
	}
	if (node._height !== newHeight) {
		node._height = newHeight;
		for (let s = node._subs; s !== null; s = s._nextSub) {
			const sub = s._sub;
			if (sub._kind !== EFFECT_PURE) insertIntoHeapHeight(sub, heapFor(sub));
		}
	}
}
/**
* Run heap - process all scheduled effects in topological (height) order.
* Re-scans until fully drained: effects may write signals that re-insert
* nodes at lower heights (feedback writes).
*/
function runHeap(heap) {
	while (heap._count > 0) {
		const end = heap._max;
		for (let height = heap._min; height <= end; height++) {
			let node = heap._heap[height];
			while (node !== void 0) {
				if (node._flags & REACTIVE_IN_HEAP) {
					updateIfNecessary(node);
					deleteFromHeap(node, heap);
				} else adjustHeight(node, heap);
				node = heap._heap[height];
			}
		}
	}
	heap._min = HEAP_EMPTY_MIN;
	heap._max = 0;
}
var currentObserver = null;
var tracking = false;
var scheduled = false;
var clock = 0;
var defaultContext = {};
/**
* The ambient owner. O4.5: this is an OBSERVATION channel — user-written
* `onCleanup()` and `Ctx.use()` find their owner through it — and never a
* decision channel. A primitive with a `Scope` argument in scope that reads
* this instead is the defect the redesign exists to remove.
*/
var currentOwner = null;
/**
* The computation whose scope `currentOwner` stands for, while that scope is
* still unallocated. Q6: a computation that owns nothing never pays for a
* Scope, so the owner is materialised on the first thing that needs one.
*/
var currentHost = null;
var scopesAllocated = 0;
var effectsAllocated = 0;
function makeScope(parent) {
	scopesAllocated++;
	return {
		parent,
		ctx: parent !== null ? parent.ctx : defaultContext,
		cleanups: null,
		kids: null,
		catcher: parent !== null ? parent.catcher : null,
		gen: 0,
		dead: false,
		origin: void 0,
		dispose: null,
		_prev: null,
		_prevHost: null,
		_open: false,
		_abort: null,
		_range: null,
		_forked: false
	};
}
/** The scope a computation owns its children through, allocated on demand. */
function hostScope(node) {
	let scope = node._scope;
	if (scope === null) {
		scope = makeScope(node._owner);
		scope.dispose = () => disposeNode(node);
		node._scope = scope;
	}
	return scope;
}
function getCurrentOwner() {
	if (currentOwner === null && currentHost !== null) currentOwner = hostScope(currentHost);
	return currentOwner;
}
/**
* Get the current owner context.
* Useful for capturing owner to restore later in async callbacks.
*/
function getOwner() {
	return getCurrentOwner();
}
/** The scope a construct was handed, or a throw naming where it was missing. */
function requireScope(scope, origin) {
	if (scope === void 0) throw new ScopeMissingError(origin);
	return scope;
}
/**
* O2/O4.5: run `fn` with the scope a construct was GIVEN as `CURRENT`, so every
* ambient read below it resolves to that argument rather than to whatever
* happened to be current at the call site. Handing a construct scope A while B
* is ambient must put its subtree under A; without this the argument is
* decoration and `pin` has nothing to override.
*/
function underScope(scope, origin, fn) {
	const given = requireScope(scope, origin);
	const prevOwner = currentOwner;
	const prevHost = currentHost;
	currentOwner = given;
	currentHost = null;
	try {
		return fn(given);
	} finally {
		currentOwner = prevOwner;
		currentHost = prevHost;
	}
}
/** Restore `CURRENT` to what it was before `scope`'s `enter` (O4.1, O4.3). */
function exit(scope) {
	if (!scope._open) return;
	scope._open = false;
	currentOwner = scope._prev;
	currentHost = scope._prevHost;
	scope._prev = null;
	scope._prevHost = null;
	if (OWNERSHIP.sink !== null) OWNERSHIP.sink.exit(scope);
}
/**
* O3.2: kids in reverse creation order, depth-first.
*
* The array is detached from the scope BEFORE the walk, which is what tells a
* child disposing inside it not to splice itself out of a list that is being
* discarded whole. A module-global depth counter said the same thing for the
* wrong scope: any disposal happening anywhere while some unrelated tree was
* unwinding skipped its splice too, and a long-lived parent kept every dead
* child forever — the leak the guard exists to prevent, at one remove.
*/
function unwindKids(scope) {
	const kids = scope.kids;
	if (kids === null) return;
	scope.kids = null;
	unwindKidsInner(kids);
	kids.length = 0;
}
function unwindKidsInner(kids) {
	for (let i = kids.length - 1; i >= 0; i--) {
		const kid = kids[i];
		if (kid.kids !== void 0) disposeScope(kid);
		else disposeNode(kid);
	}
}
/** O3.3: cleanups LIFO, after every kid is gone. */
function unwindCleanups(scope) {
	const cleanups = scope.cleanups;
	if (cleanups === null) return;
	for (let i = cleanups.length - 1; i >= 0; i--) runUntracked(cleanups[i], scope.catcher, scope);
	cleanups.length = 0;
}
/**
* O3: total and ordered, and idempotent. Mark dead and bump `gen` first, so a
* cleanup that schedules work observes a dead scope; then kids, then cleanups,
* then the abort signal, then the range.
*/
function disposeScope(scope) {
	if (scope.dead) return;
	scope.dead = true;
	scope.gen++;
	if (OWNERSHIP.sink !== null) OWNERSHIP.sink.dispose(scope);
	const parent = scope.parent;
	if (parent !== null && parent.kids !== null) {
		const at = parent.kids.indexOf(scope);
		if (at !== -1) parent.kids.splice(at, 1);
	}
	unwindKids(scope);
	unwindCleanups(scope);
	const abort = scope._abort;
	if (abort !== null) {
		scope._abort = null;
		abort.abort();
	}
	const range = scope._range;
	if (range !== null) {
		scope._range = null;
		range();
	}
}
/** O3.5: the range removal this scope owns; disposal runs it last. */
function ownRange(scope, remove) {
	scope._range = remove;
}
/**
* X6/§3.3: share the parent record by reference until the first provide, then
* `Object.create` once. A scope that provides nothing costs nothing, and a
* provider costs one prototype link regardless of how many keys are in scope.
*/
function provideOn(scope, key, value) {
	if (isBlock(value)) throw new ScopeMissingError("provide (a Block reached a Cell slot)");
	if (!scope._forked) {
		scope.ctx = Object.create(scope.ctx);
		scope._forked = true;
	}
	scope.ctx[key] = value;
}
/** Returned by `lookupContext` for a key no scope on the chain binds. */
var CONTEXT_MISS = Symbol("context-miss");
/**
* X3: resolution is a walk of the scope chain, performed when the read
* happens. Only a scope's OWN record counts, so a provider installed above a
* consumer that already exists is still found — which is the whole point of
* X3 and the reason `ErrorBoundary`'s build-then-install ordering is harmless.
* Resolving through `ctx`'s prototype chain instead captures the record at
* scope-creation time, which X3 forbids in as many words.
*/
function lookupContext(scope, key) {
	for (let at = scope; at !== null; at = at.parent) if (at._forked && Object.hasOwn(at.ctx, key)) return at.ctx[key];
	return CONTEXT_MISS;
}
/** The same walk from a computation, which may not have materialised a scope. */
function lookupNodeContext(node, key) {
	return lookupContext(node._scope !== null ? node._scope : node._owner, key);
}
/**
* Effects and cleanups created while `CURRENT` was null, in creation order.
*
* O5 says `render(block, container)` opens the root scope and invokes the
* block under it, and once M3's calling convention lands that is the whole
* story. Until it does, the compiler emits `render(Tree({}), host)` — the
* subtree is an ARGUMENT, so it is built before `render` is entered and there
* is no owner in existence at the moment its effects are created. Dropping
* them on the floor is what makes every barq mount leak its reactive graph.
*
* So they are held here instead, and the next root scope claims them. Pure
* computeds are not collected: nothing schedules them, and disposing the
* effects that read them unlinks them anyway, so a list would only retain
* garbage.
*
* **The window is one turn.** A mount claims what the same synchronous turn
* built, and `flushSync` drops whatever is still unclaimed when the turn's work
* settles. Holding them for the lifetime of the process instead made every
* ownerless effect immortal — 217 bytes retained per effect, measured, and a
* 14–30% slowdown on the DOM rows — and let an unrelated later `render` adopt
* and destroy work it had nothing to do with.
*
* **This list dies with M8, not M3.** M3 made the COMPILED path build under the
* root, but the un-compiled consumers (`packages/extra`, `packages/kitchen-sink`)
* still build ownerless and their `onCleanup` has nowhere else to go. Once §8
* puts them on the barq compiler, `adoptOrphans` has nothing to find and the
* three functions below go with it. Pinned in extra/src/m8-convention.test.ts.
*/
var orphans = [];
/** Move everything built with no owner onto `scope`, oldest first. */
function adoptOrphans(scope) {
	if (orphans.length === 0) return;
	const kids = scope.kids ??= [];
	for (let i = 0; i < orphans.length; i++) {
		const kid = orphans[i];
		if (kid.kids !== void 0) kid.parent = scope;
		else {
			kid._owner = scope;
			const own = kid._scope;
			if (own !== null) own.parent = scope;
		}
		kids.push(kid);
	}
	release(orphans);
}
/** Cleanups registered with no owner; adopted by the same root scope. */
var orphanCleanups = [];
function adoptOrphanCleanups(scope) {
	if (orphanCleanups.length === 0) return;
	const cleanups = scope.cleanups ??= [];
	for (let i = 0; i < orphanCleanups.length; i++) cleanups.push(orphanCleanups[i]);
	release(orphanCleanups);
}
/**
* `list.length = 0` publishes a shorter length and leaves the old values in
* the backing vector, where they go on holding everything they reference. On a
* module-level list that is a permanent leak — 253 bytes per ownerless effect,
* measured, with the list reading as empty the whole time — so the slots are
* released before the length is.
*/
function release(list) {
	for (let i = 0; i < list.length; i++) list[i] = void 0;
	list.length = 0;
}
/** Close the claim window: unclaimed at flush time is unclaimed for good. */
function dropOrphans() {
	if (orphans.length !== 0) release(orphans);
	if (orphanCleanups.length !== 0) release(orphanCleanups);
}
/**
* O5: open the root scope a mount is owned by. It is a catcher by
* construction, so E1's "the nearest catching scope always exists" is true
* without a walk.
*
* `claimOrphans` is the ALREADY-BUILT form's bridge and nothing else. The
* orphan list bounds the claim in TIME, not by PROVENANCE: a module that
* initialises library state and mounts in the same synchronous turn puts that
* library's ownerless effects on the same list, and a root that claims it
* adopts — and later destroys — work it had nothing to do with. That trade is
* only worth making when the argument was built before `render` was entered
* and there is no other owner for it. When `render` is handed a Block the
* subtree builds UNDER this scope, so there is nothing to claim and claiming
* anyway is pure relocation.
*/
function enterRoot(claimOrphans = true) {
	const scope = makeScope(null);
	scope.dispose = () => disposeScope(scope);
	scope.catcher = { handle: rootCatch };
	scope._prev = currentOwner;
	scope._prevHost = currentHost;
	scope._open = true;
	currentOwner = scope;
	currentHost = null;
	if (OWNERSHIP.sink !== null) OWNERSHIP.sink.enter(scope, null, "root", false);
	if (claimOrphans) {
		adoptOrphans(scope);
		adoptOrphanCleanups(scope);
	}
	return scope;
}
function rootCatch(error) {
	throw error;
}
function link(dep, sub) {
	const prevDep = sub._depsTail;
	if (prevDep !== null && prevDep._dep === dep) return;
	let nextDep = null;
	const isRecomputing = sub._flags & REACTIVE_RECOMPUTING_DEPS;
	if (isRecomputing) {
		nextDep = prevDep !== null ? prevDep._nextDep : sub._deps;
		if (nextDep !== null && nextDep._dep === dep) {
			nextDep._lastValue = dep._value;
			nextDep._gen = sub._depGen;
			sub._depsTail = nextDep;
			return;
		}
	}
	const prevSub = dep._subsTail;
	if (prevSub !== null && prevSub._sub === sub && (!isRecomputing || prevSub._gen === sub._depGen)) return;
	markEpoch++;
	const newLink = {
		_dep: dep,
		_sub: sub,
		_nextDep: nextDep,
		_prevSub: prevSub,
		_nextSub: null,
		_lastValue: dep._value,
		_gen: sub._depGen
	};
	sub._depsTail = newLink;
	if (prevDep !== null) prevDep._nextDep = newLink;
	else sub._deps = newLink;
	dep._subsTail = newLink;
	if (prevSub !== null) prevSub._nextSub = newLink;
	else dep._subs = newLink;
}
function unlinkSubs(linkNode) {
	const dep = linkNode._dep;
	const nextDep = linkNode._nextDep;
	const nextSub = linkNode._nextSub;
	const prevSub = linkNode._prevSub;
	if (nextSub !== null) nextSub._prevSub = prevSub;
	else dep._subsTail = prevSub;
	if (prevSub !== null) prevSub._nextSub = nextSub;
	else dep._subs = nextSub;
	if (dep._subs === null && dep._unobserved) dep._unobserved();
	return nextDep;
}
function cleanupDeps(sub) {
	let link = sub._deps;
	while (link !== null) link = unlinkSubs(link);
	sub._deps = null;
	sub._depsTail = null;
}
/**
* Bumped whenever any invalidation mark is consumed (recompute, validation,
* self-mark drop) or the topology changes. While the epoch is unchanged,
* marks already placed are still standing, so neither a signal that already
* propagated nor a pure node already visited needs to be walked again.
* Doubles as the propagation wave id.
*/
var markEpoch = 1;
var markWave = 0;
var waveEpoch = 0;
/**
* Mark a node CHECK or DIRTY. Effects are inserted into their heap;
* pure computeds propagate CHECK to their subscribers (lazy pull).
*
* Epoch stamps make a propagation re-traverse pure nodes that are still
* marked from an earlier epoch (a downstream effect may have dropped its
* self-mark since), while deduplicating within one epoch - diamonds visit
* each node once, and so do repeated writes that consumed no marks.
*/
function markNode(node, newState) {
	const flags = node._flags;
	if (flags & REACTIVE_DISPOSED) return;
	const current = flags & 3;
	if (node._kind !== EFFECT_PURE) {
		if (current < newState) node._flags = flags & -4 | newState;
		else if (flags & 12) return;
		insertIntoHeap(node, heapFor(node));
		schedule();
		return;
	}
	if (node._wave === markWave) {
		if (current < newState) node._flags = flags & -4 | newState;
		return;
	}
	node._wave = markWave;
	if (current < newState) node._flags = flags & -4 | newState;
	for (let l = node._subs; l !== null; l = l._nextSub) markNode(l._sub, REACTIVE_CHECK);
}
/**
* Open a propagation wave. A wave is a traversal id, not a call id: while the
* epoch is unchanged no mark has been consumed anywhere, so every node the
* current wave already visited still carries the mark it was given and still
* has its own subscribers marked. Re-opening the wave under those conditions
* would only re-walk ground that is still standing, which is what made a
* four-write batch cost four full traversals instead of one.
*/
function openWave() {
	if (waveEpoch !== markEpoch) {
		markWave++;
		waveEpoch = markEpoch;
	}
}
/**
* Notify subscribers of a changed node.
* `state` is DIRTY for unconditional recompute (equals: false sources,
* errors, async transitions), CHECK otherwise (value comparison gates).
*/
function propagate(node, state) {
	openWave();
	for (let l = node._subs; l !== null; l = l._nextSub) markNode(l._sub, state);
}
/**
* Re-mark subscribers of a pure computed that just recomputed, WITHOUT
* re-walking the closure below them.
*
* The invariant that makes this sound: `markNode` never marks a pure node
* without also marking that node's subscribers, so a pure node that is
* currently marked has its whole descendant closure marked at CHECK or above.
* A recompute is always reached through such a mark, so by the time a value
* changes here, everything downstream was already told to revalidate by the
* write that started the pull. Walking it again is pure re-traversal - and it
* is what made propagation quadratic in graph depth (F1): with 800 layers the
* sweep spent 54M `markNode` calls to place marks that were already there.
*
* What the direct level still needs is the CHECK -> DIRTY upgrade, because
* DIRTY is the only mark that survives an `equals` comparison against an
* unchanged snapshot. One level below that, CHECK is sufficient: any change
* must pass through a direct subscriber to reach them.
*
* A subscriber that is CLEAN is the one case the invariant says nothing about,
* so it gets the full walk. It is reachable when a link outlived the mark that
* created it - and being unreachable in the common case is exactly why it must
* not be assumed away.
*/
function repropagate(node, state) {
	for (let l = node._subs; l !== null; l = l._nextSub) {
		const sub = l._sub;
		const flags = sub._flags;
		if (flags & REACTIVE_DISPOSED) continue;
		const current = flags & 3;
		if (sub._kind !== EFFECT_PURE) {
			if (current < state) sub._flags = flags & -4 | state;
			else if (flags & 12) continue;
			insertIntoHeap(sub, heapFor(sub));
			schedule();
			continue;
		}
		if (current === 0) {
			openWave();
			markNode(sub, state);
			continue;
		}
		if (current < state) sub._flags = flags & -4 | state;
	}
}
function depEquals(dep, a, b) {
	const eq = dep._equals;
	if (eq === false || eq === defaultEquals) return a === b || a !== a && b !== b;
	return eq(a, b);
}
/**
* Resolve CHECK/DIRTY state. CHECK walks deps in read order: computed deps
* are validated recursively, then each dep's current value is compared with
* the snapshot taken at link time. Only an actual change recomputes.
*/
function updateIfNecessary(node) {
	const flags = node._flags;
	if (flags & REACTIVE_DISPOSED) return;
	if (!(flags & 3)) return;
	if (flags & REACTIVE_DIRTY) {
		recompute(node);
		return;
	}
	for (let d = node._deps; d !== null; d = d._nextDep) {
		const dep = d._dep;
		if (dep._fn !== void 0) {
			updateIfNecessary(dep);
			if (node._flags & REACTIVE_DIRTY) {
				recompute(node);
				return;
			}
			if (dep._flags & 384) {
				recompute(node);
				return;
			}
		}
		if (!depEquals(dep, d._lastValue, dep._value)) {
			recompute(node);
			return;
		}
	}
	node._flags &= -2;
	markEpoch++;
}
/** Run disposal-phase callbacks untracked so reads don't leak into parents */
/**
* O3.6: a cleanup that throws routes to the scope's catcher and MUST NOT abort
* the remaining cleanups. `catcher` is copied at `enter`, so reaching it is a
* field read rather than a walk — and it is the reader that field was missing:
* it was written by `makeScope` and `enterRoot` and consulted by nothing, which
* made E1 look covered by a cost with no behaviour attached.
*
* A catcher that rethrows (the root's) still may not abort the unwind, so the
* rethrow is caught here and reported. What routing buys is that a boundary
* ABOVE the dying scope sees the error at all.
*/
function runUntracked(fn, catcher = null, scope) {
	const prevTracking = tracking;
	const prevObserver = currentObserver;
	tracking = false;
	currentObserver = null;
	try {
		fn();
	} catch (err) {
		if (catcher !== null) try {
			catcher.handle(err, scope);
			return;
		} catch {}
		console.error("Error in cleanup:", err);
	} finally {
		tracking = prevTracking;
		currentObserver = prevObserver;
	}
}
/** Effect cleanup before re-run/dispose: children first, then own cleanups */
function runEffectCleanups(node) {
	const scope = node._scope;
	if (scope !== null) {
		scope.gen++;
		unwindKids(scope);
	}
	if (node._cleanup) {
		const cleanup = node._cleanup;
		node._cleanup = void 0;
		runUntracked(cleanup);
	}
	if (scope !== null) unwindCleanups(scope);
}
function registerWithBoundary(node) {
	const found = lookupNodeContext(node, LOADING_BOUNDARY);
	const handle = found === CONTEXT_MISS ? void 0 : found;
	if (handle) {
		node._boundary = handle;
		handle.add(node);
		return;
	}
	node._name;
}
function unregisterFromBoundary(node) {
	if (node._boundary) {
		node._boundary.delete(node);
		node._boundary = null;
	}
}
var flushError = null;
/**
* Route an effect error to the nearest error boundary, else rethrow.
* During a flush the rethrow is deferred to the end of the flush so the
* remaining queued effects still run (a failed effect must not strand
* unrelated work in the queue).
*/
function handleEffectError(node, error) {
	const routed = lookupNodeContext(node, ERROR_BOUNDARY);
	const handler = routed === CONTEXT_MISS ? void 0 : routed;
	if (handler) {
		handler(error);
		return;
	}
	if (isFlushing) {
		if (!flushError) flushError = { error };
		return;
	}
	throw error;
}
function recompute(node) {
	if (node._flags & REACTIVE_DISPOSED) return;
	markEpoch++;
	const isEffect = node._kind !== EFFECT_PURE;
	deleteFromHeap(node, isEffect ? heapFor(node) : renderHeap);
	const owned = node._scope;
	if (node._cleanup !== void 0 || owned !== null && (owned.cleanups !== null && owned.cleanups.length > 0 || owned.kids !== null && owned.kids.length > 0)) runEffectCleanups(node);
	const wasPending = (node._flags & STATUS_PENDING) !== 0;
	node._flags &= -388;
	node._error = void 0;
	node._depsTail = null;
	node._depGen++;
	const prevObserver = currentObserver;
	const prevTracking = tracking;
	const prevOwner = currentOwner;
	const prevHost = currentHost;
	currentObserver = node;
	node._flags |= REACTIVE_RECOMPUTING_DEPS;
	tracking = true;
	currentOwner = node._scope;
	currentHost = node;
	let newValue;
	let threw = false;
	let notReady = false;
	let error;
	try {
		newValue = node._fn(node._flags & REACTIVE_UNINITIALIZED ? void 0 : node._value);
	} catch (err) {
		threw = true;
		if (err instanceof NotReadyError) notReady = true;
		else error = err;
	} finally {
		tracking = prevTracking;
		currentObserver = prevObserver;
		node._flags &= -5;
		currentOwner = prevOwner;
		currentHost = prevHost;
	}
	const depsTail = node._depsTail;
	let toRemove = depsTail !== null ? depsTail._nextDep : node._deps;
	if (toRemove !== null) {
		if (depsTail !== null) depsTail._nextDep = null;
		else node._deps = null;
		while (toRemove !== null) toRemove = unlinkSubs(toRemove);
	}
	if (threw) {
		if (notReady) {
			if (!isEffect && node._loadingWindow === true) return;
			node._flags |= STATUS_PENDING;
			if (isEffect) registerWithBoundary(node);
			else {
				if (activeAsyncSession !== null) node._session = activeAsyncSession;
				if (!wasPending) propagate(node, REACTIVE_DIRTY);
			}
		} else {
			if (isEffect) {
				clearSelfMarks(node);
				handleEffectError(node, error);
				return;
			}
			node._loadingWindow = false;
			node._error = error;
			node._flags |= STATUS_ERROR;
			propagate(node, REACTIVE_DIRTY);
		}
		if (isEffect) clearSelfMarks(node);
		return;
	}
	const source = isEffect ? null : asyncSourceOf(newValue);
	if (source !== null) {
		node._closeAsync?.();
		node._closeAsync = void 0;
		const id = node._asyncId = (node._asyncId ?? 0) + 1;
		if (node._loadingWindow !== true) {
			node._flags |= STATUS_PENDING;
			if (!wasPending) propagate(node, REACTIVE_DIRTY);
		}
		const session = activeAsyncSession ?? node._session ?? null;
		node._session = session;
		/** The node is superseded, disposed, or was never this run's */
		const stale = () => (node._flags & REACTIVE_DISPOSED) !== 0 || node._asyncId !== id;
		const settled = (value) => {
			node._loadingWindow = false;
			node._flags &= -193;
			node._value = value;
			if (node._serializeKey !== void 0) recordHydrationValue(node._session ?? null, node._serializeKey, value);
			propagate(node, REACTIVE_DIRTY);
			schedule();
		};
		const failed = (err) => {
			node._loadingWindow = false;
			node._flags = node._flags & -129 | STATUS_ERROR;
			node._error = err;
			propagate(node, REACTIVE_DIRTY);
			schedule();
		};
		if (source.iterator === null) {
			const awaited = source.thenable;
			if (node._inFlight) inFlight.delete(node._inFlight);
			node._inFlight = awaited;
			inFlight.set(awaited, session);
			awaited.then((value) => {
				inFlight.delete(awaited);
				if (stale()) return;
				settled(value);
			}, (err) => {
				inFlight.delete(awaited);
				if (stale()) return;
				failed(err);
			});
			return;
		}
		pumpAsyncIterator(node, source.iterator, session, stale, settled, failed);
		return;
	}
	if (isEffect && wasPending) unregisterFromBoundary(node);
	node._loadingWindow = false;
	if ((node._flags & REACTIVE_UNINITIALIZED) !== 0 || wasPending || node._equals === false || !node._equals(node._value, newValue)) {
		node._value = newValue;
		if (!isEffect) repropagate(node, node._equals === false || wasPending ? REACTIVE_DIRTY : REACTIVE_CHECK);
	}
	if (isEffect) {
		if (node._apply) {
			const prev = node._appliedValue;
			node._appliedValue = newValue;
			const apply = node._apply;
			const prevT = tracking;
			const prevO = currentObserver;
			const applyOwner = currentOwner;
			const applyHost = currentHost;
			tracking = false;
			currentObserver = null;
			currentOwner = node._scope;
			currentHost = node;
			try {
				const cleanup = apply(newValue, prev);
				if (typeof cleanup === "function") node._cleanup = cleanup;
			} finally {
				tracking = prevT;
				currentObserver = prevO;
				currentOwner = applyOwner;
				currentHost = applyHost;
			}
		} else if (typeof newValue === "function") node._cleanup = newValue;
	}
	node._flags &= -65;
	if (isEffect) clearSelfMarks(node);
}
/**
* Writes from an effect to its own dependencies do not re-trigger the
* effect (self-marks are dropped after the run). Pure computeds keep
* self-marks so the next read revalidates.
*
* When a self-mark is dropped, dep snapshots are resynced to the values
* the effect itself wrote — those count as "seen", so only a later
* external change re-triggers the effect.
*/
function clearSelfMarks(node) {
	if (node._flags & 3) {
		for (let d = node._deps; d !== null; d = d._nextDep) d._lastValue = d._dep._value;
		node._flags &= -4;
		markEpoch++;
	}
}
function disposeNode(node) {
	if (node._flags & REACTIVE_DISPOSED) return;
	node._flags |= REACTIVE_DISPOSED;
	if (node._inFlight) {
		inFlight.delete(node._inFlight);
		node._inFlight = void 0;
	}
	node._closeAsync?.();
	node._closeAsync = void 0;
	unregisterFromBoundary(node);
	const scope = node._scope;
	if (scope !== null) {
		scope.dead = true;
		scope.gen++;
		unwindKids(scope);
	}
	if (node._cleanup) {
		const cleanup = node._cleanup;
		node._cleanup = void 0;
		runUntracked(cleanup);
	}
	if (scope !== null) {
		unwindCleanups(scope);
		const abort = scope._abort;
		if (abort !== null) {
			scope._abort = null;
			abort.abort();
		}
		const range = scope._range;
		if (range !== null) {
			scope._range = null;
			range();
		}
	}
	deleteFromHeap(node, node._kind === EFFECT_USER ? userHeap : renderHeap);
	cleanupDeps(node);
	node._subs = null;
	node._subsTail = null;
}
var isFlushing = false;
/** Schedule an async flush on the microtask queue (latches until flush) */
function schedule() {
	if (scheduled || isFlushing || false) return;
	scheduled = true;
	queueMicrotask(() => {
		scheduled = false;
		flushSync();
	});
}
/**
* Synchronously drain all scheduled effects.
* Render effects always run before user effects within each pass.
*/
function flushSync() {
	if (isFlushing || false) return;
	isFlushing = true;
	dropOrphans();
	flushError = null;
	try {
		let count = 0;
		while (renderHeap._count > 0 || userHeap._count > 0) {
			if (++count === 1e5) throw new Error("Potential infinite loop detected");
			clock++;
			if (renderHeap._count > 0) runHeap(renderHeap);
			else runHeap(userHeap);
		}
		const pendingError = flushError;
		if (pendingError) {
			flushError = null;
			throw pendingError.error;
		}
	} finally {
		isFlushing = false;
	}
}
/**
* Synchronously flush all pending updates.
* With a callback, runs it first so its writes are applied by the flush.
*/
function flush(fn) {
	if (fn) fn();
	flushSync();
}
function defaultEquals(a, b) {
	return a === b || a !== a && b !== b;
}
/**
* Create a reactive signal.
*
* `signal(value)` - plain writable signal
* `signal(fn)` - writable derived signal: recomputed by fn(prev) when its
* dependencies change, and writable via set/update until they do.
*/
function signal(initialValue, options) {
	if (typeof initialValue === "function") return writableComputed(initialValue, options);
	const node = {
		_value: initialValue,
		_subs: null,
		_subsTail: null,
		_equals: options?.equals !== void 0 ? options.equals : defaultEquals,
		_name: options?.name,
		_unobserved: options?.unobserved,
		_epoch: 0,
		_fn: void 0,
		_affected: 0,
		_override: null
	};
	const read = () => {
		if (slowSignalRead !== 0) return readSignalSlow(node);
		if (!tracking) return node._value;
		if (currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) link(node, currentObserver);
		return node._value;
	};
	options?.ownedWrite;
	const write = (newValue) => {
		const eq = node._equals;
		const prev = node._value;
		if (eq === defaultEquals) {
			if (prev === newValue || prev !== prev && newValue !== newValue) return;
		} else if (eq !== false && eq(prev, newValue)) return;
		node._value = newValue;
		if (node._subs !== null && node._epoch !== markEpoch) {
			node._epoch = markEpoch;
			propagate(node, eq === false ? REACTIVE_DIRTY : REACTIVE_CHECK);
		}
	};
	const accessor = read;
	accessor.set = write;
	accessor.update = (fn) => write(fn(node._value));
	accessor.peek = () => slowSignalRead !== 0 && node._override !== null && true ? foldOverride(node) : node._value;
	accessor._node = node;
	return accessor;
}
function createComputedNode(fn, kind, options) {
	const host = currentHost;
	const owner = getCurrentOwner();
	if (host !== null && host._flags & REACTIVE_CHILDREN_FORBIDDEN) options?.name;
	let initialHeight = 0;
	if (currentObserver) initialHeight = currentObserver._height + 1;
	const node = {
		_value: void 0,
		_subs: null,
		_subsTail: null,
		_override: null,
		_equals: kind === EFFECT_PURE ? options?.equals !== void 0 ? options.equals : defaultEquals : false,
		_name: options?.name,
		_unobserved: options?.unobserved,
		_epoch: 0,
		_fn: fn,
		_affected: 0,
		_deps: null,
		_depsTail: null,
		_flags: 66,
		_height: initialHeight,
		_nextHeap: void 0,
		_prevHeap: null,
		_kind: kind,
		_depGen: 0,
		_owner: owner,
		_scope: null,
		_cleanup: void 0,
		_apply: void 0,
		_error: void 0,
		_wave: 0
	};
	node._prevHeap = node;
	if (options !== void 0 && "loadingValue" in options) {
		node._value = options.loadingValue;
		node._loadingWindow = true;
		node._flags &= -65;
	}
	if (owner !== null) (owner.kids ??= []).push(node);
	else if (kind !== EFFECT_PURE) orphans.push(node);
	if (externalSource !== null) wireExternalSource(node, owner);
	if (OWNERSHIP.sink !== null) OWNERSHIP.sink.own(node, owner, kind === EFFECT_RENDER ? "render" : kind === EFFECT_USER ? "user" : "pure");
	return node;
}
/** Shared read implementation for computed/writable-derived accessors */
function computedRead(node) {
	const flags = node._flags;
	if (!tracking && !(flags & 1443)) return node._value;
	if (flags & REACTIVE_DISPOSED) return node._value;
	if (flags & 3) updateIfNecessary(node);
	if (tracking && currentObserver && !(currentObserver._flags & REACTIVE_DISPOSED)) {
		link(node, currentObserver);
		if (node._height >= currentObserver._height) currentObserver._height = node._height + 1;
	}
	if (node._flags & STATUS_ERROR) throw node._error;
	if (node._flags & 1152) throw new NotReadyError(node);
	return node._value;
}
function computedPeek(node) {
	if (node._flags & 3 && !(node._flags & REACTIVE_DISPOSED)) {
		const prevTracking = tracking;
		const prevObserver = currentObserver;
		tracking = false;
		currentObserver = null;
		try {
			updateIfNecessary(node);
		} finally {
			tracking = prevTracking;
			currentObserver = prevObserver;
		}
	}
	return node._value;
}
/** Writable derived signal: signal(fn) */
function writableComputed(fn, options) {
	const node = createComputedNode(fn, EFFECT_PURE, options);
	const write = (newValue) => {
		if (node._flags & REACTIVE_UNINITIALIZED) computedPeek(node);
		if (!(node._equals === false || !node._equals(node._value, newValue))) return;
		node._value = newValue;
		if (node._subs !== null) propagate(node, node._equals === false ? REACTIVE_DIRTY : REACTIVE_CHECK);
	};
	const accessor = (() => computedRead(node));
	accessor.set = write;
	accessor.update = (f) => write(f(computedPeek(node)));
	accessor.peek = () => computedPeek(node);
	accessor._node = node;
	return accessor;
}
function createEffectNode(compute, apply, kind) {
	effectsAllocated++;
	const node = createComputedNode(compute, kind);
	node._apply = apply;
	recompute(node);
	return () => disposeNode(node);
}
/**
* Render-phase effect: runs synchronously at creation and before user
* effects on subsequent flushes. Used by the renderer for DOM bindings.
*/
function renderEffect(compute, apply) {
	return createEffectNode(compute, apply, EFFECT_RENDER);
}
var rootCounts = /* @__PURE__ */ new Map();
/**
* Start a fresh id epoch. Server renders get one for free (each carries its
* own async session); the client's epoch spans the page, so only reused
* processes and tests need to call this.
*/
function resetChildIds(session) {
	if (session !== void 0) rootCounts.delete(session);
	else rootCounts.clear();
}
/** In-flight async computations, stamped with the session that started them */
var inFlight = /* @__PURE__ */ new Map();
/**
* Promises/A+ shape. `instanceof Promise` is a test about the CONSTRUCTOR, and
* a thenable from another realm, another library, or a transpiled async
* function is none the less awaitable — `await` itself asks this question, so a
* reactivity core that asks the narrower one disagrees with the language.
*/
function isThenable(value) {
	return value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
/**
* What kind of async a compute's return value is, or `null` for a plain value.
* An async iterable is checked FIRST: an async generator object is not a
* thenable, but a hand-written source may be both, and the stream is the
* stronger claim.
*
* The probe is untracked. The value may be a store proxy, and a `get` on one
* registers a dependency — on whatever observer happens to be current, since by
* here the recompute has already restored the outer one.
*/
function asyncSourceOf(value) {
	if (value === null || typeof value !== "object" && typeof value !== "function") return null;
	const prevTracking = tracking;
	const prevObserver = currentObserver;
	tracking = false;
	currentObserver = null;
	try {
		const method = value[Symbol.asyncIterator];
		if (typeof method === "function") return {
			iterator: method.call(value),
			thenable: null
		};
		return isThenable(value) ? {
			iterator: null,
			thenable: value
		} : null;
	} finally {
		tracking = prevTracking;
		currentObserver = prevObserver;
	}
}
/**
* Drain an async iterable into a computed, one yield at a time.
*
* The node is PENDING until the FIRST yield and settled from then on: a stream
* is in flight until it has an answer, and after that it is a value that keeps
* changing, which is a signal being written and not a boundary's business. The
* alternative — re-suspending per step — flaps every `Loading` above it once
* per element, and the fallback is exactly what a stream exists to avoid.
*
* `inFlight` therefore carries the FIRST step only, so `settle()` waits for the
* stream's first answer rather than for a producer that may never finish.
*
* Disposal and supersession both close the iterator through `_closeAsync`,
* which is what runs a generator's own `finally` and stops an endless producer.
*/
function pumpAsyncIterator(node, iterator, session, stale, settled, failed) {
	let closed = false;
	let first = true;
	const close = () => {
		if (closed) return;
		closed = true;
		try {
			const returned = iterator.return?.();
			if (isThenable(returned)) returned.then(void 0, () => {});
		} catch {}
	};
	node._closeAsync = close;
	const step = () => {
		if (closed || stale()) {
			close();
			return;
		}
		let result;
		try {
			result = iterator.next();
		} catch (err) {
			closed = true;
			if (!stale()) failed(err);
			return;
		}
		const awaited = isThenable(result) ? result : Promise.resolve(result);
		if (first) {
			if (node._inFlight) inFlight.delete(node._inFlight);
			node._inFlight = awaited;
			inFlight.set(awaited, session);
		}
		awaited.then((next) => {
			if (first) {
				inFlight.delete(awaited);
				node._inFlight = void 0;
			}
			if (stale()) {
				close();
				return;
			}
			if (next.done === true) {
				closed = true;
				node._closeAsync = void 0;
				if (first) settled(void 0);
				return;
			}
			first = false;
			settled(next.value);
			step();
		}, (err) => {
			if (first) {
				inFlight.delete(awaited);
				node._inFlight = void 0;
			}
			closed = true;
			node._closeAsync = void 0;
			if (!stale()) failed(err);
		});
	};
	step();
}
/** Resolved values of keyed async computeds, bucketed by session (SSR) */
var hydrationData = /* @__PURE__ */ new Map();
function recordHydrationValue(session, key, value) {
	let bucket = hydrationData.get(session);
	if (!bucket) {
		bucket = /* @__PURE__ */ new Map();
		hydrationData.set(session, bucket);
	}
	bucket.set(key, value);
}
/** Session active while a fetch starts; lets settle() wait only its own work */
var activeAsyncSession = null;
/**
* Set the active async session; fetches started while it's set are
* attributed to it. Returns the previous session for restoring.
* Used by renderToStringAsync to isolate concurrent server renders.
*/
function setAsyncSession(session) {
	const prev = activeAsyncSession;
	activeAsyncSession = session;
	return prev;
}
function flushIn(session) {
	if (session === void 0) {
		flushSync();
		return;
	}
	const prev = activeAsyncSession;
	activeAsyncSession = session;
	try {
		flushSync();
	} finally {
		activeAsyncSession = prev;
	}
}
function inFlightOf(session) {
	const waiting = [];
	for (const [promise, owner] of inFlight) if (session === void 0 || owner === session) waiting.push(promise);
	return waiting;
}
var IGNORE = () => {};
/**
* One step of `settle`: wait for the FIRST of this session's in-flight promises,
* then flush. `false` when nothing was in flight.
*
* Streaming needs the step and not the fixpoint. `settle` returns only once
* every promise in the session has settled, so a stream driven by it holds every
* parked boundary until the SLOWEST one resolves — measured at 281 ms of
* head-of-line delay on a 20 ms boundary sharing a session with a 300 ms one.
*/
async function settleStep(session) {
	flushIn(session);
	const waiting = inFlightOf(session);
	if (waiting.length === 0) return false;
	await Promise.race(waiting.map((promise) => promise.then(IGNORE, IGNORE)));
	flushIn(session);
	return true;
}
/**
* SSR: resolved values of keyed async computeds, for serialization.
* With a session, returns that render's values (plus unsessioned ones).
*/
function getHydrationData(session) {
	const result = {};
	if (session !== void 0) {
		const bucket = hydrationData.get(session);
		if (bucket) for (const [key, value] of bucket) result[key] = value;
		return result;
	}
	for (const [, bucket] of hydrationData) for (const [key, value] of bucket) result[key] = value;
	return result;
}
/** SSR: reset recorded async data (one session's, or everything) */
function clearHydrationData(session) {
	if (session !== void 0) {
		hydrationData.delete(session);
		hydrationData.delete(null);
	} else hydrationData.clear();
	resetChildIds(session);
}
/**
* Seeded values the client never claimed, reported once hydration has settled.
*
* An auto-key is an owner-tree POSITION, so a client tree that is not the
* server's shifts every key after the divergence: a read can then claim a value
* recorded for a different call and resolve synchronously with it, which is
* wrong data rather than a refetch. Nothing positional can tell those apart at
* the moment of the read — the key carries no information about what was
* fetched — but the leftovers prove it afterwards, because a shifted tree
* always strands the tail of the payload.
*
* `{ name }` folds an identity into the auto-key, and `{ key }` replaces it
* outright; either takes a read out of the positional scheme.
*/
function unclaimedSeeds() {
	const store = globalThis.__BARQ_DATA__;
	const unclaimed = store === void 0 ? [] : Object.keys(store);
	if (unclaimed.length !== 0) `${unclaimed.length}${unclaimed.join(", ")}`;
	return unclaimed;
}
/**
* Non-zero while any rare read mode is live (an `affects` mark, a pending
* override). The signal read tests this one global before doing anything
* unusual, so the ordinary path stays two branches.
*
* Snapshot capture used to be the other occupant. M9 deleted it (§4.1): it had
* no consumer outside its own test, and it cost a `_snapshot` slot on EVERY
* signal node — which §4.2 states as a hard budget, because every field is
* present on every instance to keep the shape monomorphic.
*/
var slowSignalRead = 0;
/**
* The read path taken while an affects mark or a pending override is live.
* Kept out of line so the ordinary read stays small enough to inline.
*/
function readSignalSlow(node) {
	if (node._affected !== 0 && true) {
		if (tracking && currentObserver !== null && !(currentObserver._flags & REACTIVE_DISPOSED)) link(node, currentObserver);
		throw new NotReadyError(node);
	}
	if (node._override !== null) {
		if (tracking && currentObserver !== null && !(currentObserver._flags & REACTIVE_DISPOSED)) link(node, currentObserver);
		return foldOverride(node);
	}
	if (!tracking) return node._value;
	const observer = currentObserver;
	if (observer === null || observer._flags & REACTIVE_DISPOSED) return node._value;
	link(node, observer);
	return node._value;
}
function foldOverride(node) {
	const layers = node._override;
	const prevTracking = tracking;
	tracking = false;
	try {
		let value = node._value;
		for (let i = 0; i < layers.length; i++) value = layers[i].patch(value);
		return value;
	} finally {
		tracking = prevTracking;
	}
}
var externalSource = null;
function wireExternalSource(node, owner) {
	const bridge = signal(void 0, {
		equals: false,
		ownedWrite: true
	});
	const source = externalSource.factory(node._fn, () => bridge.set(void 0));
	if (owner !== null) (owner.cleanups ??= []).push(() => source.dispose());
	node._fn = (prev) => {
		bridge();
		return source.track(prev);
	};
}
/**
* Boundary primitives (Solid 2.0 parity).
*
* These are the DOM-free cores that the `<Loading>`, `<Errored>` and
* `<Reveal>` components are built on: each takes a content thunk and returns
* an accessor that yields either the content or the boundary's stand-in.
* Reach for them when authoring custom boundary components.
*/
/** Boundary-owned signals are written from inside computations by design */
var BOUNDARY_SIGNAL = { ownedWrite: true };
function createPendingCollector() {
	const pendingNodes = /* @__PURE__ */ new Set();
	const count = signal(0, BOUNDARY_SIGNAL);
	const handle = {
		add(node) {
			if (!pendingNodes.has(node)) {
				pendingNodes.add(node);
				count.set(pendingNodes.size);
			}
		},
		delete(node) {
			if (pendingNodes.delete(node)) count.set(pendingNodes.size);
		}
	};
	return {
		handle,
		count: () => count(),
		install(owner) {
			provideOn(owner, LOADING_BOUNDARY, handle);
		}
	};
}
function createErrorCollector() {
	const error = signal(void 0, BOUNDARY_SIGNAL);
	const failed = signal(false, BOUNDARY_SIGNAL);
	const capture = (err) => {
		error.set(err);
		failed.set(true);
	};
	return {
		error: () => error(),
		failed: () => failed(),
		capture,
		clear() {
			failed.set(false);
			error.set(void 0);
		},
		install(owner) {
			provideOn(owner, ERROR_BOUNDARY, capture);
		}
	};
}
function isArray(value) {
	return Array.isArray(value);
}
/**
* Claim-based hydration. `CODESIGN.md` §3.11 and §12, `SEMANTICS.md` H1–H4, H6.
*
* The client CLAIMS the server's nodes by walking them. Nothing is cleared,
* nothing is replaced, and the walk that claims is the walk that would have
* built — `child`/`sib` replace `.firstChild`/`.nextSibling` under `hydratable`
* and address the same positions.
*
* THE WIRE FORMAT, which the compiler writes and this file reads:
*
*   <!--[-->  …  <!--]-->     a hole the client cannot bound on its own
*   <!--[--> … <!--]-->       a control-flow range
*   <!--[k--> …  <!--]-->     the same range in a DEV build, `k` the key the
*                             primitive CHOSE
*   <!--[b:N--> … <!--]-->    a boundary the stream has not flushed yet
*   <!---->                   a skeleton marker, present on both sides
*
* and, as important, what it does NOT carry:
*
*   a hole that owns its parent element's whole child list — no comments; the
*     extent is every child of the parent and the client reads it off the
*     document
*   a row of an `each` — no comments; the rows are built in order and each one
*     claims from the list's cursor, so its extent is what it consumed
*
* §12 REVERSED §11 Q4 on a measurement: the boundary comments cost 55.7% raw
* and 7.3% gzipped on a 100-row page, and 7.3% on every page forever is
* material. The split that replaces it is this: THE WIRE CARRIES WHAT RECOVERY
* NEEDS AND NOTHING ELSE, and DETECTION is an emission axis that a dev build
* turns on and a production build does not have. What is left above is
* load-bearing for the claim itself — a delimited hole's extent is data the
* client cannot compute, and a range's identity is a decision only the server
* made.
*
* Every claim below either succeeds or throws [`HydrationMismatch`], and every
* catcher is one of exactly two:
*
*  - a REGION catches it and rebuilds its own range — H4's local blast radius;
*  - `hydrate` catches it and does a full client render — today's behaviour,
*    exactly, which is the worst case this design admits.
*
* There is no third option and in particular no arm that swallows one.
*/
var ELEMENT = 1;
var COMMENT = 8;
var TEXT = 3;
/**
* Thrown by every claim that cannot be satisfied. It is never caught by the
* code that raised it: a region catches its own, `hydrate` catches the rest.
*/
var HydrationMismatch = class extends Error {
	kind;
	constructor(kind, detail) {
		super(`hydration mismatch (${kind}): ${detail}`);
		this.name = "HydrationMismatch";
		this.kind = kind;
	}
};
var SESSION = null;
/** True while a claim is live. Every hot path tests this and nothing else. */
function hydrating() {
	return SESSION !== null && SESSION.stack.length > 0;
}
/**
* Record a divergence that was RECOVERED rather than thrown.
*
* A text difference is the case: the server said one thing, the client another,
* and writing the client's value through the claimed text node keeps the node
* and fixes the content. It is still a divergence and still gets a row, because
* "nothing was reported" has to mean "nothing diverged".
*/
function report(kind, detail) {
	if (SESSION !== null) SESSION.mismatches.push({
		kind,
		detail
	});
}
function beginHydration(container) {
	SESSION = {
		container,
		marked: hasRanges(container),
		stack: [{
			parent: container,
			next: container.firstChild,
			end: null
		}],
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0
	};
}
/**
* Does this markup carry range comments?
*
* One scan, at the start, and it is what lets a construct with no flag tell its
* two situations apart. A module built without the flag over markup built
* without it is ORDINARY — nothing was ever going to be claimed there, and
* building cold is exactly right. The same module over markup built WITH it is a
* deployment mistake, and a bad one: the client's walk is native, so it steps
* onto a boundary comment and everything it addresses after that is off by an
* unknown amount. That is not recoverable locally and must not be treated as if
* it were.
*
* `true` proves the markup is hydratable; `false` proves nothing. §12 took the
* comments off every position whose extent the client can read off its parent,
* so a hydratable page can now carry none at all. The caller uses it to choose
* the wording of a diagnostic, which is all a one-way signal can carry.
*/
function wireIsMarked() {
	return SESSION !== null && SESSION.marked;
}
function hasRanges(root) {
	for (let node = root.firstChild; node !== null; node = node.nextSibling) {
		if (node.nodeType === COMMENT && node.data.charAt(0) === "[") return true;
		if (node.nodeType === ELEMENT && hasRanges(node)) return true;
	}
	return false;
}
function endHydration() {
	const session = SESSION;
	SESSION = null;
	if (session === null) return {
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0
	};
	return {
		mismatches: session.mismatches,
		claimed: session.claimed,
		ranges: session.ranges,
		built: session.built
	};
}
/**
* A cursor over `range`'s interior that OUTLIVES one entry into it.
*
* The rows of an `each` are why it exists. A row used to be delimited on the
* wire so the client could hand row `i` its own nodes; it does not need to be,
* because the rows are built in ORDER and a row's extent is exactly what its
* build consumed. One cursor, shared by every row, is the whole mechanism —
* which is what let 1,600 bytes of the 100-row page's 6,416 go.
*/
function openCursor(range) {
	const parent = range.open?.parentNode ?? range.parent;
	return {
		parent,
		next: range.open === null ? parent.firstChild : range.open.nextSibling,
		end: range.close
	};
}
/** Run `body` claiming from `cursor`, which keeps whatever it consumed. */
function atCursor(cursor, body) {
	if (SESSION === null) return body();
	SESSION.stack.push(cursor);
	try {
		return body();
	} finally {
		SESSION.stack.pop();
	}
}
/** Run `body` claiming from `range`'s interior, once. */
function withRange(range, body) {
	if (SESSION === null) return body();
	return atCursor(openCursor(range), body);
}
function describe(node) {
	if (node.nodeType === COMMENT) return `<!--${node.data}-->`;
	if (node.nodeType === TEXT) return `the text ${JSON.stringify(node.data)}`;
	return `<${node.nodeName.toLowerCase()}>`;
}
/**
* The range the server wrote at `(parent, anchor)` — the same pair the compiler
* handed `insert` and the four primitives.
*
* A position's content ends immediately before its anchor, so the anchor's
* previous sibling is that position's `<!--]-->`; with no anchor the position is
* the last thing in its parent and the parent's last child is. Nothing searches:
* if the comment is not exactly there, the client is not looking at the tree the
* server serialised and says so.
*
* `mode` is the compiler's `WHOLE`, and it is the §12 half: a hole that owns its
* parent's child list was written with no comments at all.
*/
function claimRange(parent, anchor, mode) {
	const host = anchor !== null ? anchor.parentNode : parent;
	if (host === null) throw new HydrationMismatch("range", "a claim at a position with no parent");
	if (SESSION === null || !SESSION.container.contains(host)) return null;
	if (mode === 16) {
		const nodes = [];
		for (let node = host.firstChild; node !== null; node = node.nextSibling) nodes.push(node);
		SESSION.ranges++;
		return {
			open: null,
			close: null,
			parent: host,
			nodes
		};
	}
	const close = anchor !== null ? anchor.previousSibling : host.lastChild;
	if (close === null || close.nodeType !== COMMENT || close.data !== "]") throw new HydrationMismatch("range", `expected <!--]--> before ${anchor === null ? "the end of " : ""}<${host.nodeName.toLowerCase()}>, found ${close === null ? "nothing" : describe(close)}`);
	let depth = 0;
	const nodes = [];
	for (let node = close.previousSibling; node !== null; node = node.previousSibling) {
		if (node.nodeType === COMMENT) {
			const data = node.data;
			if (data === "]") depth++;
			else if (data.charAt(0) === "[") {
				if (depth === 0) {
					nodes.reverse();
					SESSION.ranges++;
					return {
						open: node,
						close,
						parent: host,
						nodes
					};
				}
				depth--;
			}
		}
		nodes.push(node);
	}
	throw new HydrationMismatch("range", "a <!--]--> whose <!--[--> is not in the same parent");
}
new Set(Object.keys({
	"input:value": 1,
	"textarea:value": 1,
	"select:value": 1,
	"input:checked": 1,
	"input:indeterminate": 1,
	"option:selected": 1,
	"details:open": 1,
	"dialog:open": 1,
	"audio:currentTime": 1,
	"video:currentTime": 1,
	"audio:volume": 1,
	"video:volume": 1,
	"*:scrollTop": 1,
	"*:scrollLeft": 1
}).map((k) => k.slice(k.indexOf(":") + 1)));
/**
* Brand carried by every value the compiler's SSR string mode produces. A
* module that fell back to this DOM backend (DESIGN §5's eight non-inlinable
* flow components) can still render a component compiled to strings, and
* without this it would insert the markup as escaped text.
*
* A REGISTERED SYMBOL, and that is the security property: this brand decides
* whether a value is written as markup or escaped as text, so a shape
* `JSON.parse` can produce would make every deserialised object an injection
* point. `Symbol.for` is unreachable from JSON and still identical across two
* copies of this module, which the `.` and `./server` entries really are.
*/
var SSR_HTML_BRAND = Symbol.for("barq.ssr.html");
function isSsrHtml(value) {
	return typeof value === "object" && value !== null && value[SSR_HTML_BRAND] === true && typeof value.t === "string";
}
function ssrHtmlNodes(value) {
	const holder = document.createElement("template");
	holder.innerHTML = value.t;
	return Array.from(holder.content.childNodes);
}
/**
* Reading a fragment's children is destructive: whoever reads them inserts
* them, which MOVES them out, so a second read of the same eager
* `children`/`fallback` finds an empty fragment and the content is gone for
* good. Remembering the drained list is what makes a multi-node body survive a
* hide/show cycle — and target #8 hands the runtime eager bodies as a matter of
* course, so this is the ordinary path rather than an edge of it.
*/
var drainedFragments = /* @__PURE__ */ new WeakMap();
function drainFragment(fragment) {
	if (fragment.firstChild === null) {
		const remembered = drainedFragments.get(fragment);
		return remembered === void 0 ? [] : remembered.slice();
	}
	const nodes = [];
	while (fragment.firstChild) {
		nodes.push(fragment.firstChild);
		fragment.removeChild(fragment.firstChild);
	}
	drainedFragments.set(fragment, nodes);
	return nodes.slice();
}
/**
* Flatten a child value to nodes, reusing previous text nodes positionally
* when their content matches (avoids re-creating text per update).
*/
function normalizeChildToNodes(value, prev, s) {
	const out = [];
	const visit = (child) => {
		if (child === null || child === void 0 || typeof child === "boolean") return;
		if (child instanceof DocumentFragment) {
			for (const node of drainFragment(child)) out.push(node);
			return;
		}
		if (child instanceof Node) {
			out.push(child);
			return;
		}
		if (isSsrHtml(child)) {
			for (const node of ssrHtmlNodes(child)) out.push(node);
			return;
		}
		if (typeof child === "function") {
			visit(child(s));
			return;
		}
		if (Array.isArray(child)) {
			for (let i = 0; i < child.length; i++) visit(child[i]);
			return;
		}
		const text = String(child);
		const candidate = prev[out.length];
		if (candidate && candidate.nodeType === 3 && candidate.data === text) out.push(candidate);
		else out.push(document.createTextNode(text));
	};
	visit(value);
	return out;
}
/**
* Reconcile two node arrays in place (udomdiff: common prefix/suffix,
* swap shortcut, lazy Map fallback). Keys are node identities - exactly
* right for fine-grained rendering where rows keep their DOM nodes.
* Adapted from https://github.com/WebReflection/udomdiff
*/
function reconcileNodeArrays(parent, a, b, after) {
	const bLength = b.length;
	let aEnd = a.length;
	let bEnd = bLength;
	let aStart = 0;
	let bStart = 0;
	let map = null;
	while (aStart < aEnd || bStart < bEnd) {
		if (a[aStart] === b[bStart]) {
			aStart++;
			bStart++;
			continue;
		}
		while (a[aEnd - 1] === b[bEnd - 1]) {
			aEnd--;
			bEnd--;
		}
		if (aEnd === aStart) {
			const anchor = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
			while (bStart < bEnd) parent.insertBefore(b[bStart++], anchor);
		} else if (bEnd === bStart) while (aStart < aEnd) {
			if (!map || !map.has(a[aStart])) a[aStart].remove();
			aStart++;
		}
		else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
			const node = a[--aEnd].nextSibling;
			parent.insertBefore(b[bStart++], a[aStart++].nextSibling);
			parent.insertBefore(b[--bEnd], node);
			a[aEnd] = b[bEnd];
		} else {
			if (!map) {
				map = /* @__PURE__ */ new Map();
				for (let i = bStart; i < bEnd; i++) map.set(b[i], i);
			}
			const index = map.get(a[aStart]);
			if (index === void 0) a[aStart++].remove();
			else if (index < bStart || index >= bEnd) aStart++;
			else {
				let sequence = 1;
				let t;
				while (aStart + sequence < aEnd && (t = map.get(a[aStart + sequence])) !== void 0 && t === index + sequence) sequence++;
				if (sequence > index - bStart) {
					const node = a[aStart];
					while (bStart < index) parent.insertBefore(b[bStart++], node);
				} else parent.replaceChild(b[bStart++], a[aStart++]);
			}
		}
	}
}
var EMPTY_NODES = [];
/**
* Removal, in ONE DOM call when the run being removed is every child its parent
* has.
*
* `clear rows` at 1,000 rows is 1,000 `removeChild` calls where Solid issues a
* single `textContent = ""`, and in a real Chrome that per-node loop is the
* dominant term of the whole benchmark: 2.85 ms of the 3.95 ms of JS, against
* Solid's 2.56 ms for the one call. Each `removeChild` re-checks mutation
* observers, invalidates style and detaches a layout object on its own; the
* bulk write does that work once for the parent.
*
* The guard is EXACT, not a heuristic, because being wrong here deletes markup
* this hole does not own. Counting is not enough on its own — a run whose nodes
* were moved out from under this parent (a `portal`, a directive) could match
* the count while naming different nodes — so membership is verified as well.
* That is one `parentNode` read per node against a `removeChild` per node, and
* the reads do not touch layout.
*/
function removeNodes(nodes) {
	const count = nodes.length;
	if (count === 0) return;
	const host = nodes[0].parentNode;
	if (host !== null && count === host.childNodes.length && allUnder(host, nodes)) {
		host.textContent = "";
		return;
	}
	for (let i = 0; i < count; i++) nodes[i].parentNode?.removeChild(nodes[i]);
}
function allUnder(host, nodes) {
	for (let i = 0; i < nodes.length; i++) if (nodes[i].parentNode !== host) return false;
	return true;
}
/**
* Apply `value` into `parent`, replacing whatever this hole rendered last time
* (`current`), anchored before `marker` (null = end of parent). Returns the
* nodes the hole now owns.
*
* A hole tracks its own nodes instead of fencing them with comment markers, so
* it costs the nodes it actually renders: a lone text hole is one text node,
* not a text node between two comments.
*/
function applyInsert(parent, value, current, marker, s) {
	if (typeof value === "string" || typeof value === "number") {
		if (current.length === 1 && current[0].nodeType === 3) {
			current[0].data = String(value);
			return current;
		}
		if (marker === null && current.length === 0 && parent.firstChild === null) {
			parent.textContent = String(value);
			const node = parent.firstChild;
			return node === null ? EMPTY_NODES : [node];
		}
	}
	const next = normalizeChildToNodes(value, current, s);
	if (current.length === 0) {
		for (let i = 0; i < next.length; i++) parent.insertBefore(next[i], marker);
		return next;
	}
	if (next.length === 0) {
		removeNodes(current);
		return EMPTY_NODES;
	}
	reconcileNodeArrays(current[0].parentNode ?? parent, current, next, marker);
	return next;
}
/**
* Run `build` with `given` as `CURRENT`, so everything it creates is owned by
* the scope the call was HANDED rather than by whatever the call site left
* current. That is O4.5, and it is what the four flow primitives already do.
*
* `null` is left alone deliberately. `requireScope` admits it — the compiler
* emits `const _s$ = null` for a module-level root — and it names NO owner, so
* there is nothing for the argument to win. Forcing `CURRENT` to null there
* turns the effect into an ORPHAN, which `enterRoot` then CLAIMS: ownership
* would be RELOCATED rather than decided, and relocating it is the M2 bridge
* O5's registry row is about. Measured, not assumed — doing it unconditionally
* makes `render(<Tree/>, host)` stop emitting RENDER_SUBTREE_NOT_OWNED, because
* the root ends up holding the argument's effects after all. That belongs to
* O5's milestone, with the fixture re-cut in the same change.
*/
function ownedBy(given, origin, build) {
	if (given === null) {
		build();
		return;
	}
	underScope(given, origin, build);
}
/**
* Insert a child into `parent` before `marker` (or append when absent), under
* the scope the enclosing Block was given. CODESIGN §3.3 C6: scope FIRST.
*
* Taking it as an argument is what makes §3.0 rule 3 enforceable at no cost. A
* compiled Block that builds anything reaches here, so a Block invoked with no
* scope throws where it was mistimed rather than silently constructing under
* whatever happened to be current — and the ownership trace gets a `given` that
* was threaded rather than read back off `CURRENT`, which is the one comparison
* that cannot fail.
*/
function insert(s, parent, value, marker, mode) {
	const given = requireScope(s, "insert");
	let anchor = marker ?? null;
	if (isArray(value) && value.some(holdsAFunction)) {
		insert(s, parent, () => value, marker, mode);
		return;
	}
	const claim = hydrating() ? claimRange(parent, anchor, mode) : null;
	if (claim !== null && claim.close !== null) anchor = claim.close;
	if (typeof value === "function") {
		let current = claim === null ? EMPTY_NODES : claim.nodes;
		let first = claim;
		ownedBy(given, "insert", () => {
			renderEffect(() => {
				const owner = getOwner();
				if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("insert", given);
				const claiming = first;
				first = null;
				const produced = claiming === null ? value(owner) : withRange(claiming, () => value(owner));
				if (claiming !== null) detectTextDrift(current, produced);
				current = applyInsert(parent, produced, current, anchor, given);
				if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("insert");
			});
		});
		return;
	}
	if (value === null || value === void 0 || value === true || value === false) return;
	if (claim !== null) {
		detectTextDrift(claim.nodes, value);
		applyInsert(parent, value, claim.nodes, anchor, given);
		return;
	}
	if (value instanceof Node) parent.insertBefore(value, anchor);
	else if (isSsrHtml(value)) for (const node of ssrHtmlNodes(value)) parent.insertBefore(node, anchor);
	else if (Array.isArray(value)) {
		const nodes = childToNodes(value, given);
		for (let i = 0; i < nodes.length; i++) parent.insertBefore(nodes[i], anchor);
	} else {
		const text = String(value);
		if (anchor === null && text !== "" && parent.firstChild === null) {
			parent.textContent = text;
			return;
		}
		parent.insertBefore(document.createTextNode(text), anchor);
	}
}
/**
* A hole whose server text and client text differ.
*
* This is the divergence that RECOVERS: `applyInsert` writes the client's value
* through the claimed text node, so the node survives and the content is right.
* It still gets a row, because the point of the whole scheme is that "no
* mismatch was reported" means something — a timestamp rendered on the server
* and re-rendered on the client is the textbook case, and a framework that
* cannot name it is the framework that cannot name any of them.
*/
function detectTextDrift(claimed, produced) {
	if (typeof produced !== "string" && typeof produced !== "number") return;
	const want = String(produced);
	const have = claimed.length === 0 ? "" : claimed.length === 1 && claimed[0].nodeType === 3 ? claimed[0].data : null;
	if (have === want) return;
	report("text", have === null ? `the server wrote ${claimed.length} nodes where the client renders the text ${JSON.stringify(want)}` : `the server wrote ${JSON.stringify(have)} where the client renders ${JSON.stringify(want)}`);
}
/**
* Convert a Child to an array of Nodes, under the scope this construction was
* handed. `s` is threaded from `insert`'s parameter, never read back off the
* ambient owner.
*/
/**
* Whether a child value holds a function anywhere inside it — the test that
* decides whether an array is a LIVE hole. Recursive, because a nested array is
* flattened into the same range and a function two levels down is as live as
* one at the top.
*/
function holdsAFunction(child) {
	if (typeof child === "function") return true;
	return isArray(child) && child.some(holdsAFunction);
}
function childToNodes(child, s = getOwner()) {
	if (child === null || child === void 0 || child === true || child === false) return [];
	if (child instanceof DocumentFragment) return drainFragment(child);
	if (child instanceof Node) return [child];
	if (isSsrHtml(child)) return ssrHtmlNodes(child);
	if (typeof child === "function") {
		if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockEnter("children", s);
		const built = child(s);
		if (OWNERSHIP.sink !== null) OWNERSHIP.sink.blockExit("children");
		return childToNodes(built, s);
	}
	if (Array.isArray(child)) {
		const nodes = [];
		for (let i = 0; i < child.length; i++) {
			const childNodes = childToNodes(child[i], s);
			for (let j = 0; j < childNodes.length; j++) nodes.push(childNodes[j]);
		}
		return nodes;
	}
	return [document.createTextNode(String(child))];
}
function insertRendered(scope, element, container) {
	if (element === null || element === void 0 || typeof element === "boolean") return;
	if (element instanceof Node) {
		if (element.parentNode !== container) container.appendChild(element);
		return;
	}
	if (typeof element === "function") {
		insert(scope, container, element);
		return;
	}
	if (isSsrHtml(element)) {
		for (const node of ssrHtmlNodes(element)) container.appendChild(node);
		return;
	}
	if (Array.isArray(element)) {
		for (const child of element) {
			const nodes = childToNodes(child, scope);
			for (const node of nodes) container.appendChild(node);
		}
		return;
	}
	container.appendChild(document.createTextNode(String(element)));
}
/** The node a capture record points at, resolved through the claimed tree. */
function atPath(path) {
	let node = document.body;
	for (const index of path) {
		if (node === null) return null;
		node = node.childNodes[index] ?? null;
	}
	return node;
}
/**
* Replay what the user did before the bundle arrived.
*
* Claiming is what makes this possible at all. The old capture was
* COORDINATE-based and pointer-only, and `server.ts` said why: the nodes get
* replaced, so there is no node to aim a key event at and no input to put a
* value back into. With the nodes preserved, a child-index path resolves to the
* SAME element it was recorded against, so the three things a user can be in
* the middle of — a value they typed, where the caret is, and which element has
* focus — are restorable, and the events replay against real targets.
*
* Order matters and is the recorded order: state first (so a handler that reads
* `event.target.value` sees what the user typed), then the events.
*/
function replayCapturedEvents() {
	const g = globalThis;
	g.__BARQ_EVTS_STOP__?.();
	const queue = g.__BARQ_EVTS__;
	g.__BARQ_EVTS__ = void 0;
	g.__BARQ_EVTS_STOP__ = void 0;
	if (!queue || queue.length === 0) return;
	for (const rec of queue) {
		if (rec.type !== "@state" || rec.path === void 0) continue;
		const target = atPath(rec.path);
		if (target === null) continue;
		if (rec.value !== void 0) target.value = rec.value;
		if (rec.checked !== void 0) target.checked = rec.checked;
		if (rec.focus === true && typeof target.focus === "function") target.focus();
		if (rec.start !== void 0 && typeof target.setSelectionRange === "function") try {
			target.setSelectionRange(rec.start, rec.end ?? rec.start);
		} catch {}
	}
	for (const rec of queue) {
		if (rec.type === "@state") continue;
		const path = rec.path;
		const target = (path !== void 0 && path.length > 0 ? atPath(path) : null) ?? pointAt(rec);
		if (target === null) continue;
		target.dispatchEvent(eventFor(rec));
	}
	flush();
}
function pointAt(rec) {
	if (rec.x === void 0 || rec.y === void 0) return null;
	if (typeof document.elementFromPoint !== "function") return null;
	return document.elementFromPoint(rec.x, rec.y);
}
var KEYBOARD = /* @__PURE__ */ new Set([
	"keydown",
	"keyup",
	"keypress"
]);
function eventFor(rec) {
	if (KEYBOARD.has(rec.type)) return new KeyboardEvent(rec.type, {
		bubbles: true,
		cancelable: true,
		key: rec.key ?? "",
		code: rec.code ?? "",
		ctrlKey: rec.ctrlKey,
		metaKey: rec.metaKey,
		shiftKey: rec.shiftKey,
		altKey: rec.altKey
	});
	if (rec.type === "input" || rec.type === "change") return new Event(rec.type, {
		bubbles: true,
		cancelable: true
	});
	return new MouseEvent(rec.type, {
		bubbles: true,
		cancelable: true,
		clientX: rec.x ?? 0,
		clientY: rec.y ?? 0,
		button: rec.button ?? 0,
		ctrlKey: rec.ctrlKey,
		metaKey: rec.metaKey,
		shiftKey: rec.shiftKey,
		altKey: rec.altKey,
		view: typeof window === "undefined" ? void 0 : window
	});
}
/**
* Claim-based hydration (`SEMANTICS.md` H1–H4, H6).
*
* The container is NOT cleared. The compiled walk claims the server's nodes as
* it goes, and the only two outcomes are the claim succeeding or a
* `HydrationMismatch` reaching here — in which case the container is cleared
* and the page is rendered cold, which is exactly the behaviour this replaces.
* "Detectably incorrect, degrading to today" is the bar M6 was given, and the
* `recovered` row on the report is where it is read off.
*
* `fn` runs under a root, mirroring the one `renderToString` and `renderPage`
* put around theirs: without it the client's owner tree is a level shallower
* than the server's, and `computed`'s auto-keys — which are owner-tree ids —
* address different values on the two sides.
*/
function hydrate(fn, container, options) {
	hydrate.report = {
		mismatches: [],
		claimed: 0,
		ranges: 0,
		built: 0,
		recovered: false
	};
	if (options?.data) {
		const target = globalThis;
		target.__BARQ_DATA__ = {
			...target.__BARQ_DATA__,
			...options.data
		};
	}
	let clear = null;
	let failure = null;
	const served = container.firstChild !== null;
	const seeds = { ...globalThis.__BARQ_DATA__ };
	beginHydration(container);
	const marked = wireIsMarked();
	try {
		clear = mount(fn, container, true);
	} catch (error) {
		if (!(error instanceof HydrationMismatch)) {
			endHydration();
			throw error;
		}
		failure = error;
	}
	const claimReport = endHydration();
	if (failure === null && served && claimReport.claimed === 0 && claimReport.ranges === 0) failure = new HydrationMismatch("not-hydratable", marked ? "the container held markup with range comments and the render claimed none of it — the CLIENT module was not compiled with `hydratable`" : "the container held server markup the render claimed none of it, and there are no range comments to say which half is at fault — since `CODESIGN.md` §12 a page whose every position owns its element writes none, so this is either half compiled without `hydratable`");
	if (failure !== null) {
		clear?.();
		globalThis.__BARQ_DATA__ = seeds;
		resetChildIds();
		clear = mount(fn, container, false);
		hydrate.report = {
			mismatches: [...claimReport.mismatches, {
				kind: failure.kind,
				detail: failure.message
			}],
			claimed: claimReport.claimed,
			ranges: claimReport.ranges,
			built: claimReport.built,
			recovered: true
		};
		`${failure.message}`;
	} else hydrate.report = {
		...claimReport,
		recovered: false
	};
	flush();
	unclaimedSeeds();
	replayCapturedEvents();
	return clear ?? (() => {});
}
hydrate.report = {
	mismatches: [],
	claimed: 0,
	ranges: 0,
	built: 0,
	recovered: false
};
/**
* `render`, with the one line that makes it hydration or not.
*
* §3.11: "`container.textContent = ""` … currently throws the entire server
* render away". It is still exactly right for a cold render and exactly wrong
* for a claim, so it is the parameter rather than a second copy of the mount
* sequence — there is one root, one insertion, one disposer, and the claim path
* cannot drift from the path everything else is measured on.
*/
function mount(block, container, claiming) {
	if (!claiming) container.textContent = "";
	const root = enterRoot(false);
	try {
		insertRendered(root, block(root), container);
	} finally {
		exit(root);
	}
	ownRange(root, () => {
		container.textContent = "";
	});
	flush();
	return () => {
		disposeScope(root);
	};
}
//#endregion
//#region ../../../packages/server/dist/index.js
/**
* String-mode server rendering — the runtime half of the compiler's SSR
* backend (DESIGN §5 / P8b). Every function here builds bytes, and a module
* compiled entirely by the string backend renders with no `document` in scope
* at all. The one exception is `serializeNode`, the declared bridge for the
* other direction: a module that FELL BACK to the DOM backend hands a
* string-compiled caller real nodes, and serialising those needs a DOM.
*
* The compiler escapes every static byte at compile time and calls into this
* file only for the values it cannot see: `esc` for a text hole, `attr` for a
* dynamic attribute, `spreadAttrs` for a spread. The escaping tables below and
* the compiler's `lower::entity` must agree byte for byte, because the same
* markup is produced by both.
*
* Since M6 it also holds the STRING half of `flow.ts`'s four primitives —
* `branch`, `each`, `boundary`, `portal` — under the same names, in the same
* argument order, reached by the same emitted call. `CODESIGN.md` §3.11: one
* ABI, two implementations, and the compiler chooses between them by choosing
* the import SOURCE. That is what deleted `uninlinable_flow` and the
* whole-module SSR→DOM downgrade behind it.
*/
/**
* Markup a compiled module produced. It is branded rather than a bare string
* so a value crossing a hole can be told apart from user data: user data is
* escaped, this is not, and getting that backwards is an XSS hole. The brand is
* a registered SYMBOL so no deserialised object can carry it.
*/
var SsrHtml = class {
	[SSR_HTML_BRAND] = true;
	t;
	constructor(t) {
		this.t = t;
	}
	toString() {
		return this.t;
	}
};
/** Wrap already-escaped markup. Every compiled SSR root returns one of these. */
function html(t) {
	return new SsrHtml(t);
}
function firstEscapableText(value) {
	let first = value.indexOf("&");
	const lt = value.indexOf("<");
	if (lt >= 0 && (first < 0 || lt < first)) first = lt;
	const gt = value.indexOf(">");
	if (gt >= 0 && (first < 0 || gt < first)) first = gt;
	const nbsp = value.indexOf("\xA0");
	if (nbsp >= 0 && (first < 0 || nbsp < first)) first = nbsp;
	return first;
}
/**
* Where the text probe starts paying for itself. It costs four `indexOf` passes
* against the attribute probe's two, so on a short string — which is what most
* holes carry — scanning outright is cheaper than asking first.
*/
var TEXT_PROBE_ABOVE = 32;
/** Escape a string for a text node position. */
function escapeText(value) {
	let start = 0;
	if (value.length > TEXT_PROBE_ABOVE) {
		start = firstEscapableText(value);
		if (start < 0) return value;
	}
	let out = start === 0 ? "" : value.slice(0, start);
	let last = start;
	for (let i = start; i < value.length; i++) {
		const code = value.charCodeAt(i);
		let entity;
		if (code === 38) entity = "&amp;";
		else if (code === 60) entity = "&lt;";
		else if (code === 62) entity = "&gt;";
		else if (code === 160) entity = "&nbsp;";
		else continue;
		if (last !== i) out += value.slice(last, i);
		out += entity;
		last = i + 1;
	}
	if (last === 0) return value;
	return last === value.length ? out : out + value.slice(last);
}
function firstEscapableAttribute(value) {
	const amp = value.indexOf("&");
	const quote = value.indexOf("\"");
	if (amp < 0) return quote;
	if (quote < 0) return amp;
	return amp < quote ? amp : quote;
}
/** Escape a string for a double-quoted attribute value. */
function escapeAttribute(value) {
	const start = firstEscapableAttribute(value);
	if (start < 0) return value;
	let out = start === 0 ? "" : value.slice(0, start);
	let last = start;
	for (let i = start; i < value.length; i++) {
		const code = value.charCodeAt(i);
		let entity;
		if (code === 38) entity = "&amp;";
		else if (code === 34) entity = "&quot;";
		else continue;
		if (last !== i) out += value.slice(last, i);
		out += entity;
		last = i + 1;
	}
	return last === value.length ? out : out + value.slice(last);
}
/**
* A child position. Mirrors what `appendChild`/`applyInsert` do with the same
* value on the DOM path: nullish and booleans render nothing, an array
* flattens, a function is read once, and everything else becomes text.
*/
function esc(value) {
	if (typeof value === "string") return escapeText(value);
	if (value === null || value === void 0 || typeof value === "boolean") return "";
	if (typeof value === "number" || typeof value === "bigint") return String(value);
	if (typeof value === "function") return esc(value(getOwner$1()));
	if (isArray$1(value)) {
		let out = "";
		for (let i = 0; i < value.length; i++) out += esc(value[i]);
		return out;
	}
	if (isSsrHtml$1(value)) return value.t;
	const node = serializeNode(value);
	return node === null ? escapeText(toString(value)) : node;
}
/**
* The other half of DESIGN §5's two-strategy coexistence: a module that fell
* back to the DOM backend hands a string-compiled caller real nodes, and they
* have to reach the wire as the markup they already are.
*/
function serializeNode(value) {
	if (typeof Node === "undefined" || !(value instanceof Node)) return null;
	const holder = document.createElement("div");
	holder.appendChild(value.cloneNode(true));
	return holder.innerHTML;
}
/**
* The XML `Name` production, which is what `setAttribute` validates a name
* against. Only a SPREAD can carry a name that is runtime data — every compiled
* call site passes a name the compiler wrote — and a spread of untrusted props
* is otherwise an injection: `{"x onload=alert(1) y": "1"}` writes three
* attributes into the markup where the DOM path throws `InvalidCharacterError`
* and writes none. Refusing is what makes the two paths agree.
*/
var NAME_START = ":A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uD800-\\uDFFF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
new RegExp(`^[${NAME_START}][${`${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`}]*$`);
var OPEN = "<!--[";
var CLOSE = "<!--]-->";
/**
* `flow.ts`'s `HYDRATE` and `DETECT`, read from the same flags integer, because
* the compiler sets them from its options for both backends. The client's claim
* and these bytes are one decision, not two that have to agree.
*/
var HYDRATE = 4;
var DETECT = 8;
/**
* The range is the only thing in its parent element, so the client reads its
* extent off the parent and the comments are not written at all. Never set with
* `DETECT`: the open comment is where the key goes.
*/
var WHOLE = 16;
/** The key spellings that survive a comment. Anything else claims positionally. */
var SAFE_KEY = /^[\w.:+-]{0,32}$/;
/**
* `<!--[-->` … `<!--]-->` around one range, and `<!--[k-->` where the build
* asked for detection.
*
* A key that cannot be spelled safely becomes `?`, and the client then claims
* the range by POSITION and skips the comparison — which is exactly what a hole
* has always had, and what EVERY range has in a production build. Writing the
* key raw is not an option: `-->` inside a comment ends it, and a key is user
* data.
*/
function range(inner, flags, key) {
	if ((flags & WHOLE) !== 0) return inner;
	if ((flags & DETECT) === 0) return `${OPEN}-->${inner}${CLOSE}`;
	const spelled = key === void 0 || key === null || typeof key === "object" || typeof key === "function" ? "" : String(key);
	return `${OPEN}${SAFE_KEY.test(spelled) ? spelled : "?"}-->${inner}${CLOSE}`;
}
/**
* §3.11's streaming range: a boundary whose content is still to come, addressed
* by the continuation the stream will resume.
*/
function deferredRange(id, inner) {
	return `${OPEN}b:${id}-->${inner}${CLOSE}`;
}
var SINK = null;
/** Install a sink for the duration of one render. Returns the previous one. */
function setStreamSink(sink) {
	const previous = SINK;
	SINK = sink;
	return previous;
}
/**
* Re-invoke a parked continuation. It is the SAME call `boundary` made when it
* built the shell — same Block, same scope, same activation — so there is no
* second code path for a resumed boundary to diverge along, which is §3.11's
* whole claim about streaming.
*/
function resumeDeferred(body, scope) {
	return activate(scope, body, NO_ARGS, 0, "branch");
}
var NO_ARGS = [];
/**
* C3.8 at the four Cell slots of the primitive surface, exactly as `flow.ts`
* spells it. A Block reaching a Cell slot is a compiler or forwarding bug and
* must throw rather than be invoked with no scope and stringified.
*/
function cellSlot(value, origin) {
	if (isBlock$1(value)) throw new ScopeMissingError$1(`${origin} (a Block reached a Cell slot)`);
}
/** A Cell ignores every argument (§3.0 rule 1), so one spelling serves both. */
function invokeBlock(scope, body, args) {
	if (typeof body !== "function") return body;
	return body(scope, ...args);
}
/**
* One activation's bytes. `enter(given)` and nothing else — O2/O3.7 hold on the
* server for the same reason they hold on the client: an instance is a child of
* the scope the construct was HANDED.
*
* The scope is not disposed on the way out. A server render disposes its root
* once, and a range that has already been written to the wire has no later
* update to be torn down for.
*/
function activate(given, body, args, flags, kind) {
	if (body === null || body === void 0) return "";
	if ((flags & 2) !== 0) return esc(invokeBlock(given, body, args));
	const scope = enter(given, kind);
	let built = false;
	try {
		const out = esc(invokeBlock(scope, body, args));
		built = true;
		return out;
	} finally {
		exit$1(scope);
		if (!built) disposeScope(scope);
	}
}
/**
* E3 on the wire: a `branch` keyed on `{content | fallback}` plus a `try`.
*
* Both kinds collapse to the same shape here because a server render has one
* frame. An error boundary catches a CONSTRUCTION throw (E2.1 — the catcher is
* installed before the body runs, so a throw from inside an effect the body
* created lands in this `try` too) and a loading boundary catches
* `NotReadyError`, which E2.3 says an error boundary must pass through.
*
* What a server cannot do is the client's swap: there is no later frame to
* reveal content in. `renderPage` settles the graph and renders a second time
* for exactly that reason, and M6's streaming path is the other answer.
*/
function boundary(s, parent, anchor, kind, fallback, body, flags = 0, on) {
	const given = requireScope$1(s, "boundary");
	refuseASite(parent, anchor, "boundary");
	if (on !== void 0) cellSlot(on, "boundary on");
	const inner = kind === "error" ? errorBoundary(given, fallback, body, flags) : loadingBoundary(given, fallback, body);
	if ((flags & HYDRATE) === 0 || inner.t.startsWith(`${OPEN}b:`)) return inner;
	return html(range(inner.t, flags));
}
function errorBoundary(given, fallback, body, flags) {
	const collector = createErrorCollector();
	const reset = () => collector.clear();
	const asError = (err) => err instanceof Error ? err : new Error(String(err));
	const content = (scope) => {
		provideOn(scope, ERROR_BOUNDARY, (err) => {
			if (err instanceof NotReadyError$1) throw err;
			collector.capture(err);
		});
		return invokeBlock(scope, body, NO_ARGS);
	};
	try {
		const inner = activate(given, content, NO_ARGS, flags, "branch");
		if (!collector.failed()) return html(inner);
	} catch (error) {
		if (error instanceof NotReadyError$1) throw error;
		collector.capture(error);
	}
	if (fallback === null || fallback === void 0) return html("");
	const error = () => asError(collector.error());
	return html(activate(given, fallback, [error, reset], flags, "branch"));
}
function loadingBoundary(given, fallback, body) {
	const pending = createPendingCollector();
	const content = (scope) => {
		pending.install(scope);
		return invokeBlock(scope, body, NO_ARGS);
	};
	try {
		const inner = activate(given, content, NO_ARGS, 0, "branch");
		if (pending.count() === 0) return html(inner);
	} catch (error) {
		if (!(error instanceof NotReadyError$1)) throw error;
	}
	const shown = activate(given, fallback, NO_ARGS, 0, "branch");
	if (SINK === null) return html(shown);
	return html(deferredRange(SINK.defer(content, given), shown));
}
/**
* The pair a string primitive can never be given. `flow.ts` resolves the parent
* from the anchor on every write; there is no node here to resolve, so a
* non-null pair means a DOM-target call reached the string runtime and the
* markup it would produce would silently drop the subtree.
*/
function refuseASite(parent, anchor, origin) {
	if (parent === null && anchor === null) return;
	throw new Error(`${origin} was given a DOM insertion point on the string backend. The server emits \`(null, null)\`; a node here means a module compiled for the DOM is calling \`@barqjs/server\`.`);
}
/** A CELL-slot read (§3.0 rule 2): called with no scope, never with one. */
function readValue(slot, origin) {
	cellSlot(slot, origin);
	return typeof slot === "function" ? slot() : slot;
}
function slotBlock(slot) {
	return slot === null || slot === void 0 ? null : slot;
}
function ssrLoading(s, props) {
	return boundary(s, null, null, "loading", slotBlock(props.fallback), props.children, 0, props.on === void 0 ? void 0 : () => readValue(props.on, "Loading.on"));
}
/**
* The value channel: what crosses from a server render to `hydrate()`.
*
* `JSON.stringify` was the whole encoder here, which meant a `Date` arrived as a
* string, a `Map` as `{}`, and a cycle threw. seroval carries all three, and its
* JS mode costs the client nothing: the payload IS the program that rebuilds the
* value, so there is no decoder in the browser bundle.
*
* Two features are refused rather than configured, and both refusals fail
* CLOSED — the parse throws before any output exists, so there is no partial or
* ambiguous payload to reason about.
*/
/**
* `RegExp`: seroval escapes `<` at the STRING level, but emits a regular
* expression as a literal whose source is written through unescaped. Measured
* on 1.6.2:
*
* ```
* serialize({p: new RegExp("[<\/script>]")})  →  ({p:/[<\/script>]/})
* serialize({p: "<\/script>"})                →  ({p:"\x3C/script>"})
* ```
*
* Inline in a `<script>`, the first one closes the element and everything after
* it becomes markup. It cannot be repaired downstream: seroval's JS output
* inlines helpers that use `<` as a real operator (`for (let i = 0; i < n; i++)`
* in the typed-array decoder), so a blanket escape over the output corrupts the
* payload instead. The only safe consumer-side answer is to refuse the type.
*
* `ErrorPrototypeStack`: suppresses the PROTOTYPE `stack`, which is necessary
* and not sufficient — see {@link redactError}.
*/
var DISABLED = Feature.RegExp | Feature.ErrorPrototypeStack;
/**
* An `Error` reaches the wire as its name and message and nothing else.
*
* `Feature.ErrorPrototypeStack` is not enough. On Bun an `Error` carries OWN
* enumerable properties, and those ride out through `Object.assign` with the
* flag set:
*
* ```
* Object.assign(new Error("db connection failed"),
*   {originalLine:3,originalColumn:16,line:3,column:15,sourceURL:"/home/…/probe.ts"})
* ```
*
* `sourceURL` is an absolute server path. No flag in seroval's enum covers it,
* and constructing a replacement `Error` server-side does not help either —
* the replacement gets its own `sourceURL`, naming this file. Only controlling
* the emitted string does, which is what a plugin is for.
*
* Today the seed channel records resolved values only (`signals.ts` records in
* `settled`, never in `failed`), so this is reached by an Error INSIDE a
* resolved value rather than by a rejection. It is hardening, not a live leak.
*/
var redactError = createPlugin({
	tag: "barq/redacted-error",
	test: (value) => value instanceof Error,
	parse: { sync: (value, ctx) => ({
		name: ctx.parse(value.name),
		message: ctx.parse(value.message)
	}) },
	serialize: (node, ctx) => `Object.assign(new Error(${ctx.serialize(node.message)}),{name:${ctx.serialize(node.name)}})`,
	deserialize: (node, ctx) => Object.assign(new Error(ctx.deserialize(node.message)), { name: ctx.deserialize(node.name) })
});
/**
* Next.js warns above this and the reasoning transfers exactly: the seed is
* inlined in EVERY response, hydration cannot begin until it has been parsed,
* and the whole payload stays resident even when one key is read.
*/
var SEED_WARN_BYTES = 128e3;
/** Encode one render's resolved values as the JS expression that rebuilds them. */
function encodeSeed(data) {
	const payload = serialize(data, {
		disabledFeatures: DISABLED,
		plugins: [redactError]
	});
	warnIfLarge(payload.length);
	return payload;
}
function warnIfLarge(bytes) {
	if (bytes <= 128e3) return;
	console.warn(`[barq] hydration seed is ${bytes} bytes (over ${SEED_WARN_BYTES}). It is inlined in every response and hydration blocks on parsing it.`);
}
var scopes = 0;
/**
* A seed encoder for ONE render, whose flushes share references.
*
* A streamed page seeds more than once — once after the shell, once per settled
* round — and `serialize` per flush makes each one self-contained. That is
* correct within a flush and wrong across them: an object reachable from two
* keys seeded in different rounds arrives as two objects, so `a === b` on the
* server is `a !== b` on the client. Threading one `refs` map through
* `crossSerialize` is what preserves it; a later flush emits `$R[1]` where an
* earlier one defined it.
*
* The scope id is per render and not a constant, because two independent renders
* embedded in one document would otherwise index into one `$R` bucket with two
* different ref maps and overwrite each other's entries.
*/
function createSeedEncoder() {
	const scopeId = `b${scopes++}`;
	const refs = /* @__PURE__ */ new Map();
	return {
		header: getCrossReferenceHeader(scopeId),
		encode(data) {
			const payload = crossSerialize(data, {
				scopeId,
				refs,
				disabledFeatures: DISABLED,
				plugins: [redactError]
			});
			warnIfLarge(payload.length);
			return payload;
		}
	};
}
/**
* Render a page after async work settles, returning the HTML, the
* resolved keyed async data, and the inline hydration script. Safe for
* concurrent renders: each render only waits for and serializes its own
* session's fetches.
*/
async function renderPage(fn, options) {
	const session = Symbol("render-session");
	let dispose;
	let container = null;
	let stringMode = false;
	let markup = "";
	const prev = setAsyncSession(session);
	try {
		scope((d) => {
			dispose = d;
			const value = fn();
			if (isSsrHtml$1(value)) {
				stringMode = true;
				markup = value.t;
				return;
			}
			if (typeof document === "undefined") throw new Error("renderToStringAsync needs a DOM implementation (e.g. happy-dom's GlobalRegistrator) registered before rendering.");
			container = document.createElement("div");
			render(value, container);
		}, true);
		flush$1();
	} finally {
		setAsyncSession(prev);
	}
	await settle(session);
	if (stringMode) {
		const restore = setAsyncSession(session);
		try {
			let second;
			scope((d) => {
				second = d;
				const settled = fn();
				markup = isSsrHtml$1(settled) ? settled.t : typeof settled === "string" ? settled : "";
			}, true);
			flush$1();
			second();
		} finally {
			setAsyncSession(restore);
		}
	}
	const html = stringMode ? markup : container?.innerHTML ?? "";
	const data = getHydrationData(session);
	clearHydrationData(session);
	dispose();
	return {
		html,
		data,
		script: hydrationScriptFor(data, options?.nonce)
	};
}
var BOUNDARY_TIMEOUT = 5e3;
/**
* How long the whole stream outlives a boundary deadline. Separate on purpose:
* a boundary rejected at its deadline still has to reach the wire, and a
* resumed boundary may park boundaries of its own, so the stream needs its own
* backstop rather than inheriting the per-boundary one.
*/
var STREAM_GRACE = 1e3;
/**
* The client half of a swap: replace the range between `<!--[b:n-->` and its
* matching `<!--]-->` with the template that just arrived.
*
* It reads the boundary comments the string backend wrote, which is the whole
* reason §11 Q4 paid the bytes for them. Nested ranges are why the scan counts
* depth rather than stopping at the first close: a fallback may itself contain a
* range, and its `<!--]-->` is not this boundary's.
*
* Three constraints, and each of them is a property of the SOURCE rather than of
* the behaviour, because this function is shipped by `toString()`:
*
* - it closes over NOTHING. Every name it uses is a global or a local, so the
*   text below runs on a page that has none of this module.
* - it contains no `<`. Script data is raw text — the tokenizer decodes nothing
*   inside it, so there is no entity to escape a `<` with, and a `<` there is
*   the first byte of the sequence that can leave the element early. Hence the
*   countdown loop rather than `i < dead.length`.
* - it is the FUNCTION the tests drive. A snippet written as a string literal
*   beside a test that paraphrases it is two implementations, and the one that
*   ships is the one nothing runs.
*/
function swapDeferredRange(n) {
	const t = document.querySelector(`template[data-barq="${n}"]`);
	if (!t) return;
	const w = document.createTreeWalker(document.body, 128);
	let c;
	let open = null;
	while (c = w.nextNode()) if (c.data === `[b:${n}`) {
		open = c;
		break;
	}
	if (open === null) return;
	let depth = 0;
	let node = open.nextSibling;
	const dead = [];
	while (node) {
		if (node.nodeType === 8) {
			const data = node.data;
			if (data.charAt(0) === "[") depth++;
			else if (data === "]") {
				if (depth === 0) break;
				depth--;
			}
		}
		dead.push(node);
		node = node.nextSibling;
	}
	for (let i = dead.length; i--;) dead[i].parentNode?.removeChild(dead[i]);
	open.parentNode?.insertBefore(t.content, node);
	open.data = "[0";
	t.parentNode?.removeChild(t);
}
/** The same function, as the bytes a page gets. Inlined once per stream. */
var SWAP_SNIPPET = `window.__BARQ_SWAP__=${swapDeferredRange.toString()};`;
/**
* The seed channel: what tells a client read that its value is still coming.
*
* Without it a streamed page is worse than a static one. The shell arrives, the
* bundle hydrates, a keyed read misses because its boundary has not settled yet,
* and the client refetches something the server is already sending — the value
* then lands in `__BARQ_DATA__` with nobody waiting on it.
*
* So the shell declares the channel OPEN, every seed flush wakes whatever was
* waiting on the keys it carried, and the end of the stream closes it and
* releases the rest to fetch for real. A read that misses while the channel is
* open waits; a read that misses after it closes refetches, which is what a
* non-streamed page has always done.
*
* Same three constraints as `swapDeferredRange`, for the same reason — it ships
* by `toString()`: it closes over nothing, it contains no `<`, and it is the
* function the tests drive rather than a paraphrase of one.
*/
function seedChannel() {
	const waiting = {};
	const wake = (keys) => {
		const list = keys === null ? Object.keys(waiting) : keys;
		for (let i = list.length; i--;) {
			const k = list[i];
			const fns = waiting[k];
			if (!fns) continue;
			delete waiting[k];
			for (let j = fns.length; j--;) fns[j]();
		}
	};
	window.__BARQ_SEED__ = {
		open: 1,
		wait(key, fn) {
			(waiting[key] = waiting[key] ?? []).push(fn);
		},
		tell(keys) {
			wake(keys);
		},
		done() {
			window.__BARQ_SEED__.open = 0;
			wake(null);
		}
	};
}
var SEED_CHANNEL_SNIPPET = `(${seedChannel.toString()})();`;
/**
* Render to a stream: the shell first, then one `<template>` per boundary as
* its promises settle.
*
* The parts are not "chunks of a string that was already built" — the shell is
* flushed before any deferred boundary has resolved, which is the only thing
* that makes streaming worth doing.
*/
function renderToStream(fn, options) {
	const session = Symbol("stream-session");
	const encoder = new TextEncoder();
	const parked = [];
	let next = 0;
	const sink = { defer(body, scope) {
		const id = next++;
		parked.push({
			id,
			body,
			scope,
			at: Date.now()
		});
		return id;
	} };
	let stop;
	const stopped = new Promise((resolve) => {
		stop = () => resolve("stopped");
	});
	let ended = false;
	let consumerCancelled = false;
	const end = () => {
		ended = true;
		stop();
	};
	const deadline = options?.timeout ?? BOUNDARY_TIMEOUT;
	const timer = setTimeout(end, deadline + STREAM_GRACE);
	timer.unref?.();
	const sent = /* @__PURE__ */ new Set();
	const seeds = createSeedEncoder();
	let seededHeader = false;
	let seededChannel = false;
	const seedScript = () => {
		const fresh = {};
		let any = false;
		for (const [key, value] of Object.entries(getHydrationData(session))) {
			if (sent.has(key)) continue;
			sent.add(key);
			fresh[key] = value;
			any = true;
		}
		if (!any) return "";
		const header = seededHeader ? "" : `${seeds.header};`;
		seededHeader = true;
		const keys = Object.keys(fresh);
		return `<script${nonceAttr(options?.nonce)}>${header}window.__BARQ_DATA__=Object.assign(window.__BARQ_DATA__||{},${seeds.encode(fresh)});window.__BARQ_SEED__&&window.__BARQ_SEED__.tell(${JSON.stringify(keys)})<\/script>`;
	};
	const signal = options?.signal;
	if (signal?.aborted) end();
	signal?.addEventListener("abort", end, { once: true });
	const release = () => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", end);
	};
	let dispose;
	let shell = "";
	const previousSession = setAsyncSession(session);
	const previousSink = setStreamSink(sink);
	try {
		scope((d) => {
			dispose = d;
			const value = fn();
			shell = isSsrHtml$1(value) ? value.t : esc(value);
		}, true);
		flush$1();
	} finally {
		setStreamSink(previousSink);
		setAsyncSession(previousSession);
	}
	return new ReadableStream({
		cancel() {
			consumerCancelled = true;
			end();
		},
		async start(controller) {
			try {
				controller.enqueue(encoder.encode(shell));
				if (parked.length > 0) {
					seededChannel = true;
					controller.enqueue(encoder.encode(`<script${nonceAttr(options?.nonce)}>${SEED_CHANNEL_SNIPPET}<\/script>`));
				}
				const shellSeed = seedScript();
				if (shellSeed !== "") controller.enqueue(encoder.encode(shellSeed));
				if (parked.length > 0) controller.enqueue(encoder.encode(`<script${nonceAttr(options?.nonce)}>${SWAP_SNIPPET}<\/script>`));
				while (parked.length > 0 && !ended) {
					const round = parked.splice(0, parked.length);
					const again = [];
					for (const record of round) {
						if (ended) {
							again.push(record);
							continue;
						}
						const restore = setAsyncSession(session);
						const outerSink = setStreamSink(sink);
						let markup;
						try {
							markup = resumeDeferred(record.body, record.scope);
						} catch (error) {
							if (!(error instanceof NotReadyError$1)) throw error;
							markup = null;
						} finally {
							setStreamSink(outerSink);
							setAsyncSession(restore);
						}
						if (markup === null) {
							if (Date.now() - record.at < deadline) again.push(record);
							continue;
						}
						controller.enqueue(encoder.encode(`<template data-barq="${record.id}">${markup}</template><script${nonceAttr(options?.nonce)}>window.__BARQ_SWAP__(${record.id})<\/script>`));
					}
					const roundSeed = seedScript();
					if (roundSeed !== "") controller.enqueue(encoder.encode(roundSeed));
					if (again.length > 0) parked.unshift(...again);
					if (parked.length === 0) break;
					if (await Promise.race([settleStep(session), stopped]) !== true) break;
				}
				if (!consumerCancelled && seededChannel) controller.enqueue(encoder.encode(`<script${nonceAttr(options?.nonce)}>window.__BARQ_SEED__&&window.__BARQ_SEED__.done()<\/script>`));
				if (!consumerCancelled) controller.close();
			} catch (error) {
				if (!consumerCancelled) controller.error(error);
			} finally {
				release();
				clearHydrationData(session);
				dispose();
			}
		}
	});
}
/**
* Inline pre-hydration capture, claim-based.
*
* The old one recorded a click's COORDINATES, because hydration replaced every
* node and there was nothing else to aim at — and it captured no keyboard or
* input events at all, for the same reason: a keystroke has no coordinates and
* a typed value has nowhere to go once its input has been thrown away.
*
* Claiming preserves the node, so the target is recorded as a PATH of child
* indices and resolves to the same element after hydration. That is what puts
* `keydown` and the typed value and the caret position in the queue at all;
* `SEMANTICS.md` H6 is the rule it exists for. The coordinates are still
* recorded, as the fallback for the recovered case — a page that had to be
* re-rendered cold has no stable path, and a pointer event can still find its
* way by `elementFromPoint`.
*
* A `@state` record is not an event. It is the value, the checked flag, the
* selection and the focus of an element the user was editing, sampled on every
* input; the last one for a given element wins, and `hydrate` applies them all
* before it replays anything.
*/
var EVENT_CAPTURE_SNIPPET = "window.__BARQ_EVTS__=[];window.__BARQ_EVTS_STOP__=(function(){var q=window.__BARQ_EVTS__;var ts=[\"click\",\"dblclick\",\"pointerdown\",\"pointerup\",\"mousedown\",\"mouseup\",\"touchstart\",\"touchend\",\"contextmenu\",\"keydown\",\"keyup\",\"keypress\",\"input\",\"change\",\"focusin\"];var p=function(n){var a=[];while(n&&n!==document.body){var i=0;var s=n;while((s=s.previousSibling))i++;a.unshift(i);n=n.parentNode}return n?a:[]};var st=function(t){if(!t||t.value===undefined)return;q.push({type:'@state',path:p(t),value:t.value,checked:t.checked,start:t.selectionStart===null?undefined:t.selectionStart,end:t.selectionEnd===null?undefined:t.selectionEnd,focus:document.activeElement===t,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false})};var h=function(e){var t=e.target;if(e.type==='input'||e.type==='change'||e.type==='focusin')st(t);if(e.type==='focusin')return;q.push({type:e.type,path:p(t),x:e.clientX,y:e.clientY,button:e.button,key:e.key,code:e.code,ctrlKey:!!e.ctrlKey,metaKey:!!e.metaKey,shiftKey:!!e.shiftKey,altKey:!!e.altKey})};ts.forEach(function(t){document.addEventListener(t,h,true)});return function(){ts.forEach(function(t){document.removeEventListener(t,h,true)})}})();";
function hydrationScriptFor(data, nonce) {
	return `<script${nonceAttr(nonce)}>window.__BARQ_DATA__=${encodeSeed(data)};${EVENT_CAPTURE_SNIPPET}<\/script>`;
}
/**
* Every inline script a render emits carries the caller's nonce, or none of
* them do. A streamed page emits at least three — the swap snippet, one swap
* per resumed boundary, and the seed — so without this the page needs
* `script-src 'unsafe-inline'`, which is the directive CSP exists to avoid.
*/
function nonceAttr(nonce) {
	return nonce === void 0 ? "" : ` nonce="${escapeAttribute(nonce)}"`;
}
//#endregion
//#region ../../../packages/router/dist/server.js
/**
* The page handler: one request in, one `Response` out.
*
* Three rules, each of which exists because the code it sits on made it
* necessary rather than because a framework elsewhere does it.
*
*  1. **The status is decided BEFORE the shell flushes.** No SSR entry point
*     carries a status — `renderToString`, `renderToStringAsync`, `renderPage`
*     and `renderToStream` all return markup only — and `renderToStream` emits
*     the shell synchronously, so a 404 discovered mid-render would land after
*     the headers. The match runs first, the status comes from it, and the
*     render is entered afterwards.
*  2. **The render runs inside `withRequest`.** Nothing else enters it for a
*     page — `handleServerFn` is its only other caller — so without this a
*     loader's server function calling `getRequest()` throws *inside* the
*     render. With it, a middleware that refuses throws a `Response` this
*     handler returns as the page's own.
*  3. **The router owns the document.** `renderPage` returns body markup;
*     there is no `<head>`, no doctype and no title anywhere in the runtime,
*     and `Portal` writes nothing on the server so it is not an escape hatch.
*/
/**
* Render the matched chain through the STRING backend.
*
* `renderDepth` in `components.ts` is the DOM one — it calls `branch` and
* `boundary`, which build nodes. The string backend has its own implementations
* of the same constructs (`ssrLoading`), and CODESIGN §3.11's "one ABI means no
* fallback cliff" is what makes a userland component drivable by both: every
* component is `(s, props) -> Out` and `Out` is a string here.
*
* There is no `branch` on this side and none is needed. A string render has no
* later frame to re-key into, so the chain is walked once, outermost first,
* with each depth's `children` a Block the layout may place where it likes.
*/
function renderRoutes(state) {
	const chain = state.chain();
	if (chain.length === 0) return html("");
	const at = (depth) => {
		const route = chain[depth];
		if (route === void 0) return html("");
		const children = (() => at(depth + 1));
		const component = route.definition.component;
		const content = () => component === void 0 ? at(depth + 1) : component(null, routePropsFor(state, depth, route, children));
		const pending = route.definition.pending;
		return ssrLoading(null, {
			fallback: () => pending === void 0 ? html("") : pending(null, routePropsFor(state, depth, route, (() => html("")))),
			children: content
		});
	};
	return at(0);
}
/** Thrown by a loader or a guard to send the browser somewhere else. */
var Redirect = class extends Error {
	to;
	status;
	constructor(to, status = 302) {
		super(`redirect to ${to}`);
		this.name = "Redirect";
		this.to = to;
		this.status = status;
	}
};
/**
* Build the `fetch` half of a barq server.
*
* Pass it as `serveBarq({ fetch })`. Server functions are matched FIRST there,
* which is deliberate: their URL is reserved, and a page handler that also
* answered it would turn a mutation into an HTML response.
*/
function createPageHandler(options) {
	const matcher = createMatcher(flattenRoutes(options.routes));
	return async (request) => {
		const url = new URL(request.url);
		const match = matcher.match(url.pathname);
		if (options.beforeEach !== void 0) {
			const location = {
				pathname: url.pathname,
				search: url.search,
				hash: "",
				state: null,
				key: ""
			};
			for (const guard of options.beforeEach) {
				let verdict;
				try {
					verdict = await guard({
						from: location,
						to: location,
						params: match?.params ?? {}
					});
				} catch (error) {
					const answer = asResponse(error);
					if (answer !== null) return answer;
					throw error;
				}
				if (verdict === false) return new Response("forbidden", { status: 403 });
				if (typeof verdict === "string") return redirectResponse(verdict, 302);
			}
		}
		const status = match === null ? 404 : 200;
		let answer = null;
		const config = {
			routes: options.routes,
			beforeEach: options.beforeEach,
			history: memoryHistory({ initial: [url.pathname + url.search] }),
			onLoaderError(error) {
				answer ??= asResponse(error);
			}
		};
		try {
			return await withRequest(request, async () => {
				const state = createRouter(config);
				try {
					if (options.stream === false) {
						const page = await renderPage(() => options.app(state), { nonce: options.nonce });
						if (answer !== null) return answer;
						return html$1(options.document({
							body: page.html,
							seed: page.script,
							chain: match?.route.chain ?? null,
							url
						}), status);
					}
					const stream = renderToStream(() => options.app(state), {
						signal: request.signal,
						nonce: options.nonce
					});
					return new Response(wrapStream(stream, options, match?.route.chain ?? null, url), {
						status,
						headers: { "content-type": "text/html; charset=utf-8" }
					});
				} finally {
					state.dispose();
				}
			});
		} catch (error) {
			const answer = asResponse(error);
			if (answer !== null) return answer;
			throw error;
		}
	};
}
/**
* A middleware refuses by throwing a `Response`; a loader redirects by throwing
* a `Redirect`. Both are answers, not failures, and both become this page's
* response rather than a 500.
*/
function asResponse(error) {
	if (error instanceof Response) return error;
	if (error instanceof Redirect) return redirectResponse(error.to, error.status);
	return null;
}
function redirectResponse(to, status) {
	return new Response(null, {
		status,
		headers: { location: to }
	});
}
function html$1(body, status) {
	return new Response(body, {
		status,
		headers: { "content-type": "text/html; charset=utf-8" }
	});
}
/**
* Split the document around the app's markup and stream the middle.
*
* The document function is called once, with an empty body, and the result is
* cut at the marker — so the head reaches the browser before the first loader
* has settled, which is the entire point of streaming.
*/
var BODY_MARKER = "<!--barq-body-->";
function wrapStream(stream, options, chain, url) {
	const document = options.document({
		body: BODY_MARKER,
		seed: "",
		chain,
		url
	});
	const cut = document.indexOf(BODY_MARKER);
	if (cut === -1) throw new Error("the document function must place its `body` argument in the markup it returns");
	const head = document.slice(0, cut);
	const tail = document.slice(cut + 16);
	const encoder = new TextEncoder();
	return new ReadableStream({
		async start(controller) {
			controller.enqueue(encoder.encode(head));
			const reader = stream.getReader();
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
			} finally {
				reader.releaseLock();
			}
			controller.enqueue(encoder.encode(tail));
			controller.close();
		},
		cancel(reason) {
			stream.cancel(reason);
		}
	});
}
//#endregion
//#region src/routes.tsx
var Root = (_s, props) => html(`<div id="root">shell:<!--[-->${esc(props.children)}<!--]--></div>`);
var Users = (_s, props) => html(`<b id="u">${esc(props.data()?.name)}</b>`);
var Pending = () => html(`<i>loading</i>`);
var routes = [route({
	path: "/",
	component: Root,
	children: [route({
		path: "users/$id",
		component: Users,
		pending: Pending,
		loader: async ({ params }) => loadUser(params.id)
	})]
})];
//#endregion
//#region src/entry-server.tsx
var _keep = adminOnly;
var entry_server_default = { fetch: createPageHandler({
	routes,
	app: (state) => renderRoutes(state),
	document: ({ body }) => `<!doctype html><html><head></head><body><div id="app">${body}</div></body></html>`
}) };
//#endregion
export { _keep, entry_server_default as default };
