/**
 * What the builders infer. The assertions here are checked by the type checker
 * (`bun run typecheck`, and `.github/scripts/typecheck.sh` in CI); the tests
 * that run beside them show the runtime agrees with the types.
 */

import { describe, expect, test } from "bun:test";

import {
  type FreshServerFn,
  type InputCheck,
  type Middleware,
  type MiddlewareNext,
  type RequestContextOf,
  type ResultCheck,
  type ResultProblem,
  type FunctionContextOf,
  type StandardSchema,
  clientRpc,
  createMiddleware,
  createServerFn,
  createStart,
} from "./index.ts";

/** Each assignable to the other: the two types admit the same values. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const holds = <Check extends true>(proof?: Check): Check | undefined => proof;

/** `true` when `Value` is not a `Type`: what a line that should not compile would be handed. */
type Refused<Value, Type> = [Value] extends [Type] ? false : true;

/** `true` when a call with these arguments would not compile. */
type Uncallable<Fn extends (...args: never[]) => unknown, Args extends unknown[]> = Refused<
  Args,
  Parameters<Fn>
>;

const auth = createMiddleware().server(({ next }) =>
  next({ context: { user: { id: "salama", admin: true } } }),
);

const role = createMiddleware()
  .middleware([auth])
  .server(({ next, context }) => {
    holds<Equal<typeof context.user, { id: string; admin: boolean }>>();
    return next({ context: { role: context.user.admin ? ("admin" as const) : ("user" as const) } });
  });

const tenant: Middleware<{ tenant: string }> = async (next) =>
  next({ context: { tenant: "example.com" } });

test("a server function's context is what its chain passed to `next`", async () => {
  const whoami = createServerFn()
    .middleware([role, tenant])
    .handler(({ context }) => {
      holds<Equal<typeof context.user.id, string>>();
      holds<Equal<typeof context.role, "admin" | "user">>();
      holds<Equal<typeof context.tenant, string>>();
      return `${context.user.id}@${context.tenant} is ${context.role}`;
    });
  holds<Equal<Awaited<ReturnType<typeof whoami>>, string>>();

  expect(await whoami()).toBe("salama@example.com is admin");
});

test("a bare closure is held to the context it declares", () => {
  const broken = async (next: MiddlewareNext) => next();
  // It promises a tenant and passes none.
  holds<Refused<typeof broken, Middleware<{ tenant: string }>>>();
  holds<Equal<Refused<typeof tenant, Middleware<{ tenant: string }>>, false>>();
  expect(typeof broken).toBe("function");
});

test("a schema's input is what the caller passes, and its output what the handler gets", async () => {
  // A Standard Schema with a transform: the spec's `types` carries both sides.
  const isoDate: StandardSchema<string, Date> = {
    "~standard": {
      version: 1,
      vendor: "example",
      validate: (value) =>
        typeof value === "string" ? { value: new Date(value) } : { issues: [{ message: "iso" }] },
    },
  };
  const year = createServerFn()
    .validator(isoDate)
    .handler(({ data }) => {
      holds<Equal<typeof data, Date>>();
      return data.getUTCFullYear();
    });
  holds<Equal<Parameters<typeof year>[0], ({ readonly data: string } & ServerFnCall) | FormData>>();
  // The caller passes the schema's input, not its output.
  holds<Uncallable<typeof year, [{ data: Date }]>>();

  expect(await year({ data: "2026-10-15T00:00:00Z" })).toBe(2026);
});

type ServerFnCall = import("./index.ts").ServerFnCallOptions;

test("a function validator's parameter is the caller's input", async () => {
  const byId = createServerFn()
    .validator((input: { readonly id: string }) => ({ id: Number(input.id) }))
    .handler(({ data }) => {
      holds<Equal<typeof data, { id: number }>>();
      return data.id + 1;
    });
  // `id` is a string on the way in.
  holds<Uncallable<typeof byId, [{ data: { id: number } }]>>();

  expect(await byId({ data: { id: "41" } })).toBe(42);
});

test("a function with no validator takes no data", async () => {
  const ping = createServerFn().handler(() => "pong");
  // No validator, so no input.
  holds<Uncallable<typeof ping, [{ data: number }]>>();
  expect(await ping()).toBe("pong");
});

test("a middleware's validator types its own data and the handler's", async () => {
  const workspace = createMiddleware()
    .validator((input: { readonly workspace: string }) => input)
    .server(({ next, data }) => {
      holds<Equal<typeof data, { readonly workspace: string }>>();
      return next({ context: { slug: data.workspace.toLowerCase() } });
    });
  const open = createServerFn()
    .middleware([workspace])
    .handler(({ data, context }) => {
      holds<Equal<typeof data, { readonly workspace: string }>>();
      return `${data.workspace}:${context.slug}`;
    });
  // The chain validates, so the caller owes it its input.
  holds<Uncallable<typeof open, []>>();

  expect(await open({ data: { workspace: "Acme" } })).toBe("Acme:acme");
});

test("a GET function takes no form, and streams what its handler yields", () => {
  const ticks = createServerFn({ method: "GET" }).handler(async function* () {
    for (const tick of [1, 2]) yield tick;
  });
  type Yielded<Answer> = Answer extends AsyncIterable<infer Value> ? Value : never;
  holds<Equal<Yielded<Awaited<ReturnType<typeof ticks>>>, number>>();
  const stub = clientRpc<undefined, number, "GET">("ticks", [], { method: "GET" });
  // A GET has no body to carry a form.
  holds<Uncallable<typeof stub, [FormData]>>();
  expect(ticks.meta.method).toBe("GET");
});

test("the global middleware's context is typed from the start instance", () => {
  const requestId = createMiddleware({ type: "request" }).server(({ next }) =>
    next({ context: { requestId: "r-1" } }),
  );
  const locale = createMiddleware().server(({ next }) => next({ context: { locale: "ar" } }));
  const instance = createStart(() => ({
    requestMiddleware: [requestId],
    functionMiddleware: [locale],
  }));
  holds<Equal<RequestContextOf<typeof instance>["requestId"], string>>();
  holds<Equal<FunctionContextOf<typeof instance>["locale"], string>>();
  holds<Equal<FunctionContextOf<typeof instance>["requestId"], string>>();
  expect(instance.getOptions().requestMiddleware).toHaveLength(1);
});

test("a function middleware may depend on a request middleware's context", () => {
  const requestId = createMiddleware({ type: "request" }).server(({ next }) =>
    next({ context: { requestId: "r-1" } }),
  );
  const logged = createMiddleware()
    .middleware([requestId])
    .server(({ next, context }) => {
      holds<Equal<typeof context.requestId, string>>();
      return next();
    });
  expect(typeof logged).toBe("function");
});

test("a client half's sendContext and a server half's are both typed where they land", () => {
  const timed = createMiddleware().server(({ next }) =>
    next({ sendContext: { servedAt: new Date(0) } }),
  );
  const reads = createMiddleware()
    .middleware([timed])
    .client(async ({ next, context }) => {
      const result = await next();
      holds<Equal<typeof context.servedAt, Date | undefined>>();
      return result;
    });
  expect(typeof reads).toBe("function");
});

describe("what crosses the wire", () => {
  class Money {
    constructor(readonly cents: number) {}
    format(): string {
      return `${this.cents / 100}`;
    }
  }
  interface Tree {
    readonly label: string;
    readonly children: readonly Tree[];
  }

  test("a result the codec carries is accepted", () => {
    const carried = createServerFn().handler(() => ({
      at: new Date(0),
      tags: new Set(["a"]),
      totals: new Map([["salama", 1n]]),
      bytes: new Uint8Array(1),
      failure: new Error("kept"),
      nothing: undefined,
      later: Promise.resolve([1, 2]),
    }));
    const tree = createServerFn().handler((): Tree => ({ label: "root", children: [] }));
    const raw = createServerFn().handler(() => new Response("raw"));
    const ticks = createServerFn().handler(async function* () {
      for (const at of [new Date(0)]) yield { at };
    });
    expect([carried, tree, raw, ticks].every((fn) => typeof fn === "function")).toBe(true);
  });

  test("a result it cannot carry is a type error where the handler is written", () => {
    // What `.handler(fn)` holds `fn` to, beside its parameter type.
    type Accepted<Result> = ResultCheck<FreshServerFn<"POST">, Result>;
    const formats = () => ({ format: () => "1.00" });
    const keyed = () => ({ key: Symbol("salama") });
    const priced = async () => ({ total: new Money(100) });
    const linked = () => [new URL("https://example.com")];
    const patterned = () => new Map([["pattern", /salama/]]);
    async function* yieldsFunctions() {
      yield () => 1;
    }
    // A function cannot cross, nor a symbol, nor an instance of a class with
    // methods, nor a URL or a RegExp (which barq's codec refuses), nor a
    // function among the values a stream yields.
    holds<Refused<typeof formats, Accepted<ReturnType<typeof formats>>>>();
    holds<Refused<typeof keyed, Accepted<ReturnType<typeof keyed>>>>();
    holds<Refused<typeof priced, Accepted<Awaited<ReturnType<typeof priced>>>>>();
    holds<Refused<typeof linked, Accepted<ReturnType<typeof linked>>>>();
    holds<Refused<typeof patterned, Accepted<ReturnType<typeof patterned>>>>();
    holds<Refused<typeof yieldsFunctions, Accepted<ReturnType<typeof yieldsFunctions>>>>();
    const fine = () => ({ at: new Date(0) });
    holds<Equal<Refused<typeof fine, Accepted<ReturnType<typeof fine>>>, false>>();
  });

  test("the error says where the value is", () => {
    holds<Equal<ResultProblem<{ a: { b: () => void } }>, "the result.a.b is a function">>();
    holds<
      Equal<ResultProblem<{ list: readonly symbol[] }>, "the result.list[number] is a symbol">
    >();
    holds<Equal<ResultProblem<{ link: URL }>, "the result.link is a URL">>();
    holds<Equal<ResultProblem<{ fine: Date }>, never>>();
  });

  test("an input the codec cannot carry is a type error at the validator", () => {
    // What `.validator(fn)` holds `fn` to, beside its parameter type.
    type Accepted<Method extends "GET" | "POST", In> = InputCheck<FreshServerFn<Method>, In>;
    const callback = (input: { readonly onDone: () => void }) => input;
    const form = (input: FormData) => input;
    // A caller cannot send a function.
    holds<Refused<typeof callback, Accepted<"POST", Parameters<typeof callback>[0]>>>();
    // A form is a body, so a POST takes one and a GET does not.
    createServerFn().validator(form);
    holds<Refused<typeof form, Accepted<"GET", FormData>>>();
  });

  test("`strict` turns the check off, for both sides or one", () => {
    createServerFn({ strict: false })
      .validator((input: { readonly onDone: () => void }) => input)
      .handler(() => ({ format: () => "1.00" }));
    createServerFn({ strict: { output: false } }).handler(() => new Money(100));
    const callback = (input: { readonly onDone: () => void }) => input;
    const formats = () => ({ format: () => "1.00" });
    // The input side is still checked when only the output is off.
    holds<
      Refused<
        typeof callback,
        InputCheck<FreshServerFn<"POST", { output: false }>, Parameters<typeof callback>[0]>
      >
    >();
    // And the output side when only the input is off.
    holds<
      Refused<
        typeof formats,
        ResultCheck<FreshServerFn<"POST", { input: false }>, ReturnType<typeof formats>>
      >
    >();
    createServerFn({ strict: { input: false } }).validator(callback);
    createServerFn({ strict: { output: false } }).handler(formats);
  });
});
