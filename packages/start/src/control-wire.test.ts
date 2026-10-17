/**
 * A redirect and a not-found, across the server-function wire with everything
 * they said: the navigation a redirect described, and what a not-found carried.
 *
 * The thrown values are built here rather than imported, for the reason
 * `server.test.ts` gives: this package cannot import the router, and the brand
 * is the contract between the two.
 */

import { afterEach, expect, test } from "bun:test";

import {
  NOT_FOUND,
  REDIRECT,
  RPC_PREFIX,
  RpcNotFound,
  RpcRedirect,
  clientRpc,
  serverRpc,
} from "./index.ts";
import { handleServerFn, mount, unmountAll } from "./server.ts";
import { printedBy } from "./test-console.ts";

const ORIGIN = "https://example.com";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  unmountAll();
});

const throughHandler = (seen?: Response[]): void => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("origin", ORIGIN);
    const response = await handleServerFn(
      new Request(new URL(String(input), ORIGIN), { ...init, headers }),
    );
    const answered = response ?? new Response("not found", { status: 404 });
    seen?.push(answered.clone());
    return answered;
  }) as typeof fetch;
};

const throwing = (id: string, error: unknown): void => {
  mount(
    id,
    serverRpc<undefined, never>(
      { id },
      {
        validator: "unchecked",
        middleware: [],
        handler: () => {
          throw error;
        },
      },
    ),
  );
};

const redirected = (to: string, status: number, more: Record<string, unknown>): Error =>
  Object.assign(new Error(`redirect to ${to}`), { [REDIRECT]: true, to, status, ...more });

const caught = (id: string): Promise<unknown> =>
  clientRpc<undefined, never>(id)().then(
    () => "returned",
    (error: unknown) => error,
  );

test("a redirect arrives with the navigation it described", async () => {
  const options = {
    to: "/users/$id",
    params: { id: "7" },
    search: { tab: "posts", since: new Date(86_400_000) },
    hash: "top",
    replace: true,
    reloadDocument: true,
    statusCode: 308,
  };
  throwing("go", redirected("/users/7?tab=posts#top", 308, { options }));
  throughHandler();

  const error = (await caught("go")) as RpcRedirect;
  expect(error).toBeInstanceOf(RpcRedirect);
  expect(error.to).toBe("/users/7?tab=posts#top");
  expect(error.status).toBe(308);
  expect(error.statusCode).toBe(308);
  expect(error.options).toEqual(options);
  const search = error.options?.search as { since?: unknown } | undefined;
  expect(search?.since).toBeInstanceOf(Date);
});

test("an external redirect keeps its href", async () => {
  const options = { href: "https://example.com/elsewhere" };
  throwing("out", redirected("https://example.com/elsewhere", 307, { options }));
  throughHandler();

  const error = (await caught("out")) as RpcRedirect;
  expect(error.options).toEqual(options);
});

test("a redirect with no options is the two fields it always was", async () => {
  throwing("plain", redirected("/login", 302, {}));
  const seen: Response[] = [];
  throughHandler(seen);

  const error = (await caught("plain")) as RpcRedirect;
  expect(error.options).toBeUndefined();
  expect(await seen[0]?.json()).toEqual({ kind: "redirect", to: "/login", status: 302 });
});

test("a redirect's headers ride the response on both channels", async () => {
  const headers = { "set-cookie": "seen=1; Path=/", "x-reason": "expired" };
  throwing(
    "signed-out",
    redirected("/login", 302, { headers, options: { to: "/login", headers } }),
  );
  const seen: Response[] = [];
  throughHandler(seen);

  const error = (await caught("signed-out")) as RpcRedirect;
  expect(seen[0]?.headers.get("x-reason")).toBe("expired");
  expect(seen[0]?.headers.getSetCookie()).toEqual(["seen=1; Path=/"]);
  // What the response already carried is not repeated in the body.
  expect(error.options).toEqual({ to: "/login" });

  const form = await handleServerFn(
    new Request(`${ORIGIN}${RPC_PREFIX}signed-out`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: ORIGIN },
      body: "a=1",
    }),
  );
  expect(form?.status).toBe(303);
  expect(form?.headers.get("location")).toBe("/login");
  expect(form?.headers.get("x-reason")).toBe("expired");
});

test("what cannot cross is left out, and the resolved target still arrives", async () => {
  const options = { to: "/users/$id", params: (current: object) => current, replace: true };
  throwing("updater", redirected("/users/$id", 307, { options }));
  throughHandler();

  const error = (await caught("updater")) as RpcRedirect;
  expect(error.to).toBe("/users/$id");
  expect(error.options).toBeUndefined();
});

test("a redirect that names a target a browser may not be sent to is refused whole", async () => {
  const options = { href: "javascript:alert(1)" };
  throwing("bad", redirected("javascript:alert(1)", 307, { options }));
  const seen: Response[] = [];
  throughHandler(seen);

  const printed = await printedBy(() => caught("bad"));
  expect(printed).toEqual([
    [
      '[barq] A server function threw `redirect("javascript:alert(1)")`, which is not a path or an `http(s)` URL, so the redirect was refused and the call answered 500. ' +
        "Validate the value passed to `redirect()` before using it, especially when it comes from the request.",
    ],
  ]);
  expect(seen[0]?.status).toBe(500);
  expect(await seen[0]?.text()).not.toContain("javascript");
});

test("a not-found arrives with its data and the route that answers it", async () => {
  const missing = Object.assign(new Error("no such user"), {
    [NOT_FOUND]: true,
    data: { id: "7", tried: new Date(86_400_000) },
    routeId: "/users",
    headers: { "x-reason": "gone" },
  });
  throwing("user", missing);
  const seen: Response[] = [];
  throughHandler(seen);

  const error = (await caught("user")) as RpcNotFound;
  expect(error).toBeInstanceOf(RpcNotFound);
  expect(error.message).toBe("no such user");
  expect(error.isNotFound).toBe(true);
  expect(error.routeId).toBe("/users");
  expect(error.data).toEqual({ id: "7", tried: new Date(86_400_000) });
  expect(seen[0]?.status).toBe(404);
  expect(seen[0]?.headers.get("x-reason")).toBe("gone");
});

test("a not-found with nothing attached is the message alone", async () => {
  throwing("bare", Object.assign(new Error("not found"), { [NOT_FOUND]: true }));
  const seen: Response[] = [];
  throughHandler(seen);

  const error = (await caught("bare")) as RpcNotFound;
  expect(error.data).toBeUndefined();
  expect(error.routeId).toBeUndefined();
  expect(await seen[0]?.json()).toEqual({ kind: "not-found", message: "not found" });
});
